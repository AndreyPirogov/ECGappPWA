package ru.vitappio.holter.controller;

import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import ru.vitappio.holter.dto.*;
import ru.vitappio.holter.service.MedomService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/medom")
public class MedomController {

    private static final Logger log = LoggerFactory.getLogger(MedomController.class);

    private final MedomService medomService;

    public MedomController(MedomService medomService) {
        this.medomService = medomService;
    }

    @PostMapping("/credentials")
    public Map<String, Object> setCredentials(@Valid @RequestBody MedomCredentialsRequest request) {
        log.info("POST /medom/credentials — login={}", request.login());
        medomService.setCredentials(request.login(), request.password());
        var loginResult = medomService.login(request.login(), request.password());
        var pingResult = medomService.ping();

        boolean isAuth = Boolean.TRUE.equals(pingResult.get("is_auth"));
        String user = pingResult.getOrDefault("user", "").toString();
        return Map.of("ok", true, "is_auth", isAuth, "user", user);
    }

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        log.debug("GET /medom/ping");
        var info = medomService.ping();
        if (!Boolean.TRUE.equals(info.get("is_auth"))) {
            medomService.autoLogin();
            info = medomService.ping();
        }
        return info;
    }

    @GetMapping("/contracts")
    public List<Object> getContracts() {
        log.debug("GET /medom/contracts");
        return medomService.getContracts();
    }

    @PostMapping("/patients")
    public Map<String, Object> createPatient(@Valid @RequestBody MedomPatientCreateRequest request) {
        log.info("POST /medom/patients — name={} {}", request.lastName(), request.firstName());
        int patientId = medomService.createPatient(
                request.lastName(),
                request.firstName(),
                request.secondName(),
                request.isFemale(),
                request.birthDate()
        );
        return Map.of("patient_id", patientId);
    }

    @GetMapping("/devices")
    public List<Object> getDevices() {
        log.debug("GET /medom/devices");
        return medomService.getDevices();
    }

    @PostMapping("/sessions")
    public Map<String, Object> createSession(@Valid @RequestBody MedomSessionCreateRequest request) {
        log.info("POST /medom/sessions — patient={}, device={}", request.patientId(), request.deviceId());
        int sessionId = medomService.createSession(
                request.patientId(),
                request.deviceId(),
                request.comment()
        );
        return Map.of("session_id", sessionId);
    }

    @PostMapping("/sessions/{sessionId}/finish")
    public Map<String, Object> finishSession(@PathVariable int sessionId) {
        log.info("POST /medom/sessions/{}/finish", sessionId);
        return medomService.finishSession(sessionId);
    }

    @PostMapping("/sessions/{sessionId}/events")
    public Map<String, Object> addEvent(
            @PathVariable int sessionId,
            @Valid @RequestBody MedomEventCreateRequest request) {
        log.debug("POST /medom/sessions/{}/events — text={}", sessionId, request.text());
        String start = MedomService.formatEventDate(request.start());
        String finish = request.finish() != null && !request.finish().isBlank()
                ? MedomService.formatEventDate(request.finish())
                : "";
        int eventId = medomService.addUserEvent(
                sessionId,
                request.text(),
                start,
                request.severity(),
                finish
        );
        return Map.of("event_id", eventId);
    }

    @GetMapping("/sessions")
    public List<Object> getSessions(
            @RequestParam(required = false) Integer patientId,
            @RequestParam(required = false) Integer sessionId) {
        log.debug("GET /medom/sessions — patient={}, session={}", patientId, sessionId);
        return medomService.getSessions(patientId, sessionId);
    }
}
