package ru.vitappio.holter.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import ru.vitappio.holter.dto.DiaryEventCreateRequest;
import ru.vitappio.holter.dto.SessionCreateRequest;
import ru.vitappio.holter.dto.SessionFinishRequest;
import ru.vitappio.holter.exception.BadRequestException;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class SessionService {

    private static final Logger log = LoggerFactory.getLogger(SessionService.class);

    private final ConcurrentHashMap<String, Map<String, Object>> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, List<Map<String, Object>>> sessionEvents = new ConcurrentHashMap<>();

    public Map<String, Object> createSession(SessionCreateRequest req) {
        String sessionId = "s-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        var session = new ConcurrentHashMap<String, Object>();
        session.put("id", sessionId);
        session.put("patient_id", req.patientId());
        session.put("device_serial", req.deviceSerial());
        session.put("started_at", Instant.now().toString());
        session.put("status", "running");

        sessions.put(sessionId, session);
        sessionEvents.put(sessionId, new CopyOnWriteArrayList<>());
        log.info("Session created: id={}, patient={}, device={}", sessionId, req.patientId(), req.deviceSerial());
        return Map.of("session_id", sessionId, "session", session);
    }

    public Map<String, Object> getStatus(String sessionId) {
        registerExternalSession(sessionId, "");
        var session = sessions.get(sessionId);

        long elapsed = Duration.between(
                Instant.parse((String) session.get("started_at")),
                Instant.now()
        ).getSeconds();

        boolean signalOk = elapsed >= 25;
        boolean linkOk = elapsed >= 35;
        boolean batteryOk = elapsed >= 45;
        boolean ready = elapsed >= 55 && "running".equals(session.get("status"));

        return Map.of(
                "session_id", sessionId,
                "signal_ok", signalOk,
                "link_ok", linkOk,
                "battery_ok", batteryOk,
                "ready", ready,
                "elapsed_seconds", elapsed,
                "status", session.get("status")
        );
    }

    public Map<String, Object> addEvent(String sessionId, DiaryEventCreateRequest req) {
        registerExternalSession(sessionId, "");
        if (!sessionId.equals(req.sessionId())) {
            throw new BadRequestException("session_id mismatch");
        }

        String eventId = "e-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        Map<String, Object> event = Map.of(
                "id", eventId,
                "session_id", sessionId,
                "event_type", req.eventType(),
                "timestamp", req.timestamp(),
                "saved_at", Instant.now().toString()
        );
        sessionEvents.get(sessionId).add(event);
        log.debug("Event added to session {}: type={}", sessionId, req.eventType());
        return Map.of("ok", true, "event", event);
    }

    public Map<String, Object> listEvents(String sessionId) {
        registerExternalSession(sessionId, "");
        return Map.of("items", sessionEvents.getOrDefault(sessionId, List.of()));
    }

    public Map<String, Object> finishSession(String sessionId, SessionFinishRequest req) {
        registerExternalSession(sessionId, "");
        var session = sessions.get(sessionId);
        session.put("status", "finished");
        session.put("finished_at", Instant.now().toString());
        session.put("finish_reason", req.reason() != null ? req.reason() : "");
        log.info("Session finished: id={}", sessionId);
        return Map.of("ok", true, "session", session);
    }

    public boolean exists(String sessionId) {
        return sessions.containsKey(sessionId);
    }

    public void registerExternalSession(String sessionId, String patientId) {
        sessions.computeIfAbsent(sessionId, id -> {
            var session = new ConcurrentHashMap<String, Object>();
            session.put("id", id);
            session.put("patient_id", patientId != null ? patientId : "");
            session.put("device_serial", "");
            session.put("started_at", Instant.now().toString());
            session.put("status", "running");
            return session;
        });
        sessionEvents.computeIfAbsent(sessionId, id -> new CopyOnWriteArrayList<>());
    }
}
