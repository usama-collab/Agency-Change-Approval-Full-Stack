from fastapi import FastAPI

from app import agencies, auth, clients, projects

app = FastAPI(title="Agency Change Approval API", version="0.1.0")
app.include_router(auth.router)
app.include_router(agencies.router)
app.include_router(clients.router)
app.include_router(projects.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
