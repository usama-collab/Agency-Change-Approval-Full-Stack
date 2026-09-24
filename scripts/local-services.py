#!/usr/bin/env python3
"""Manage only this checkout's native PostgreSQL and Mailpit processes."""

import argparse
import os
import shlex
import signal
import socket
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".local"
PG = Path(os.environ.get("PG_BIN", "/usr/lib/postgresql/18/bin"))
PORT = int(os.environ.get("PG_PORT", "55433"))
DATA = Path(os.environ.get("PG_DATA_DIR", str(STATE / "postgres"))).resolve()
BIN = STATE / "bin" / "mailpit"


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def free(port):
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            raise SystemExit(
                f"Port {port} is occupied. Choose another port or stop the conflicting service. "
                "No existing service was stopped."
            ) from None


def mail_pid():
    path = STATE / "mailpit.pid"
    if not path.exists():
        return None
    pid = int(path.read_text())
    try:
        if Path(f"/proc/{pid}/exe").resolve() == BIN.resolve():
            return pid
    except OSError:
        pass
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["start", "stop"])
    action = parser.parse_args().action
    STATE.mkdir(exist_ok=True, mode=0o700)
    running = (
        DATA.exists()
        and subprocess.run(
            [str(PG / "pg_ctl"), "-D", str(DATA), "status"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode
        == 0
    )
    if action == "stop":
        if running:
            run(PG / "pg_ctl", "-D", DATA, "stop", "-m", "fast")
        if pid := mail_pid():
            os.kill(pid, signal.SIGTERM)
            for _ in range(50):
                if not mail_pid():
                    break
                time.sleep(0.1)
            else:
                raise SystemExit("Mailpit has not stopped yet; retry shortly.")
        return
    if not BIN.exists():
        raise SystemExit("First run scripts/install-mailpit.sh")
    if not running:
        free(PORT)
        if not DATA.exists():
            DATA.parent.mkdir(parents=True, exist_ok=True)
            password = STATE / "init-password"
            password.write_text("agency\n")
            password.chmod(0o600)
            try:
                run(
                    PG / "initdb",
                    "-D",
                    DATA,
                    "-U",
                    "agency",
                    "--auth-host=scram-sha-256",
                    "--auth-local=trust",
                    f"--pwfile={password}",
                )
            finally:
                password.unlink()
        elif not (DATA / "PG_VERSION").exists():
            raise SystemExit(
                "Existing data directory is not a cluster; refusing to initialize over it."
            )
        run(
            PG / "pg_ctl",
            "-D",
            DATA,
            "-l",
            STATE / "postgres.log",
            "-o",
            f"-h 127.0.0.1 -p {PORT} -k {shlex.quote(str(DATA))}",
            "start",
            "-w",
        )
    actual_port = int((DATA / "postmaster.pid").read_text().splitlines()[3])
    if actual_port != PORT:
        raise SystemExit(f"This cluster uses port {actual_port}; set PG_PORT accordingly.")
    env = {**os.environ, "PGPASSWORD": "agency"}
    for name in ("agency", "agency_test"):
        exists = run(
            PG / "psql",
            "-h",
            "127.0.0.1",
            "-p",
            PORT,
            "-U",
            "agency",
            "-d",
            "postgres",
            "-tAc",
            f"SELECT 1 FROM pg_database WHERE datname = '{name}'",
            env=env,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if not exists:
            run(PG / "createdb", "-h", "127.0.0.1", "-p", PORT, "-U", "agency", name, env=env)
    if not mail_pid():
        smtp = int(os.environ.get("SMTP_PORT", "1025"))
        http = int(os.environ.get("MAILPIT_HTTP_PORT", "8025"))
        free(smtp)
        free(http)
        with (STATE / "mailpit.log").open("ab") as log:
            proc = subprocess.Popen(
                [
                    str(BIN),
                    "--disable-version-check",
                    "--listen",
                    f"127.0.0.1:{http}",
                    "--smtp",
                    f"127.0.0.1:{smtp}",
                    "--database",
                    str(STATE / "mailpit.db"),
                ],
                stdout=log,
                stderr=log,
                start_new_session=True,
                env={k: v for k, v in os.environ.items() if not k.startswith("MP_")},
            )
        (STATE / "mailpit.pid").write_text(str(proc.pid))
        time.sleep(0.5)
        if proc.poll() is not None:
            raise SystemExit("Mailpit failed; inspect .local/mailpit.log")
    print(f"Native services ready. PostgreSQL: 127.0.0.1:{PORT}")


if __name__ == "__main__":
    main()
