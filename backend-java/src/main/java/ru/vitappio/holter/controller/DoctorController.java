package ru.vitappio.holter.controller;

import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import ru.vitappio.holter.config.DoctorProperties;
import ru.vitappio.holter.dto.ConclusionUploadRequest;
import ru.vitappio.holter.dto.DoctorLoginRequest;
import ru.vitappio.holter.service.PatientService;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/doctor")
public class DoctorController {

    private static final Logger log = LoggerFactory.getLogger(DoctorController.class);

    private final DoctorProperties props;
    private final PatientService patientService;
    private final Set<String> activeTokens = ConcurrentHashMap.newKeySet();

    public DoctorController(DoctorProperties props, PatientService patientService) {
        this.props = props;
        this.patientService = patientService;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody DoctorLoginRequest request) {
        log.info("POST /doctor/login — user={}", request.login());
        if (!props.getLogin().equals(request.login()) || !props.getPassword().equals(request.password())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        String token = UUID.randomUUID().toString();
        activeTokens.add(token);
        return Map.of("ok", true, "token", token);
    }

    @PostMapping("/patients/{patientId}/sessions/{sessionId}/conclusion")
    public Map<String, Object> uploadConclusion(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String patientId,
            @PathVariable String sessionId,
            @Valid @RequestBody ConclusionUploadRequest request) {
        checkAuth(authHeader);
        log.info("POST /doctor/patients/{}/sessions/{}/conclusion", patientId, sessionId);
        return patientService.uploadConclusion(patientId, sessionId, request);
    }

    @GetMapping("/patients/{patientId}/sessions/{sessionId}/conclusion")
    public Map<String, Object> getConclusion(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String patientId,
            @PathVariable String sessionId) {
        checkAuth(authHeader);
        log.debug("GET /doctor/patients/{}/sessions/{}/conclusion", patientId, sessionId);
        return patientService.getConclusion(patientId, sessionId);
    }

    private void checkAuth(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing or invalid Authorization header");
        }
        String token = authHeader.substring(7).trim();
        if (!activeTokens.contains(token)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
    }
}
