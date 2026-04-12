from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Vitappio MVP API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=2)
    birth_date: str
    gender: str


class SessionCreate(BaseModel):
    patient_id: str
    device_serial: str = Field(min_length=2)


class DiaryEventCreate(BaseModel):
    session_id: str
    event_type: str = Field(min_length=1)
    timestamp: str


class SessionFinish(BaseModel):
    reason: str | None = None


patients: dict[str, dict[str, Any]] = {}
sessions: dict[str, dict[str, Any]] = {}
session_events: dict[str, list[dict[str, Any]]] = {}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/patients")
def create_patient(payload: PatientCreate) -> dict[str, Any]:
    patient_id = f"p-{uuid4().hex[:12]}"
    patients[patient_id] = {
        "id": patient_id,
        "full_name": payload.full_name,
        "birth_date": payload.birth_date,
        "gender": payload.gender,
        "created_at": now_iso(),
    }
    return {"patient_id": patient_id, "patient": patients[patient_id]}


@app.post("/sessions")
def create_session(payload: SessionCreate) -> dict[str, Any]:
    if payload.patient_id not in patients:
        raise HTTPException(status_code=404, detail="Patient not found")

    session_id = f"s-{uuid4().hex[:12]}"
    sessions[session_id] = {
        "id": session_id,
        "patient_id": payload.patient_id,
        "device_serial": payload.device_serial,
        "started_at": now_iso(),
        "status": "running",
    }
    session_events[session_id] = []
    return {"session_id": session_id, "session": sessions[session_id]}


@app.get("/sessions/{session_id}/status")
def get_session_status(session_id: str) -> dict[str, Any]:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    elapsed_seconds = seconds_since(session["started_at"])
    signal_ok = elapsed_seconds >= 25
    link_ok = elapsed_seconds >= 35
    battery_ok = elapsed_seconds >= 45
    ready = elapsed_seconds >= 55 and session["status"] == "running"

    return {
        "session_id": session_id,
        "signal_ok": signal_ok,
        "link_ok": link_ok,
        "battery_ok": battery_ok,
        "ready": ready,
        "elapsed_seconds": elapsed_seconds,
        "status": session["status"],
    }


@app.post("/sessions/{session_id}/events")
def add_session_event(session_id: str, payload: DiaryEventCreate) -> dict[str, Any]:
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    if payload.session_id != session_id:
        raise HTTPException(status_code=400, detail="session_id mismatch")

    event = {
        "id": f"e-{uuid4().hex[:12]}",
        "session_id": session_id,
        "event_type": payload.event_type,
        "timestamp": payload.timestamp,
        "saved_at": now_iso(),
    }
    session_events[session_id].append(event)
    return {"ok": True, "event": event}


@app.get("/sessions/{session_id}/events")
def list_session_events(session_id: str) -> dict[str, Any]:
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"items": session_events.get(session_id, [])}


@app.post("/sessions/{session_id}/finish")
def finish_session(session_id: str, payload: SessionFinish) -> dict[str, Any]:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session["status"] = "finished"
    session["finished_at"] = now_iso()
    session["finish_reason"] = payload.reason
    return {"ok": True, "session": session}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def seconds_since(iso_time: str) -> int:
    start = datetime.fromisoformat(iso_time)
    delta = datetime.now(timezone.utc) - start
    return int(delta.total_seconds())
