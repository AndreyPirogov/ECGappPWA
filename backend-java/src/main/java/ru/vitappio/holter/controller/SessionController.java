package ru.vitappio.holter.controller;

import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import ru.vitappio.holter.dto.DiaryEventCreateRequest;
import ru.vitappio.holter.dto.SessionCreateRequest;
import ru.vitappio.holter.dto.SessionFinishRequest;
import ru.vitappio.holter.exception.NotFoundException;
import ru.vitappio.holter.service.PatientService;
import ru.vitappio.holter.service.SessionService;

import java.util.Map;

@RestController
public class SessionController {

    private static final Logger log = LoggerFactory.getLogger(SessionController.class);

    private final SessionService sessionService;
    private final PatientService patientService;

    public SessionController(SessionService sessionService, PatientService patientService) {
        this.sessionService = sessionService;
        this.patientService = patientService;
    }

    @PostMapping("/sessions")
    public Map<String, Object> createSession(@Valid @RequestBody SessionCreateRequest request) {
        if (!patientService.exists(request.patientId())) {
            throw new NotFoundException("Patient not found");
        }
        log.info("POST /sessions — patient={}, device={}", request.patientId(), request.deviceSerial());
        return sessionService.createSession(request);
    }

    @GetMapping("/sessions/{sessionId}/status")
    public Map<String, Object> getStatus(@PathVariable String sessionId) {
        log.debug("GET /sessions/{}/status", sessionId);
        return sessionService.getStatus(sessionId);
    }

    @PostMapping("/sessions/{sessionId}/events")
    public Map<String, Object> addEvent(
            @PathVariable String sessionId,
            @Valid @RequestBody DiaryEventCreateRequest request) {
        log.debug("POST /sessions/{}/events — type={}", sessionId, request.eventType());
        return sessionService.addEvent(sessionId, request);
    }

    @GetMapping("/sessions/{sessionId}/events")
    public Map<String, Object> listEvents(@PathVariable String sessionId) {
        return sessionService.listEvents(sessionId);
    }

    @PostMapping("/sessions/{sessionId}/finish")
    public Map<String, Object> finishSession(
            @PathVariable String sessionId,
            @RequestBody SessionFinishRequest request) {
        log.info("POST /sessions/{}/finish", sessionId);
        return sessionService.finishSession(sessionId, request);
    }
}
