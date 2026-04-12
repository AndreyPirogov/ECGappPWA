package ru.vitappio.holter.controller;

import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import ru.vitappio.holter.dto.ConclusionUploadRequest;
import ru.vitappio.holter.dto.PatientCreateRequest;
import ru.vitappio.holter.service.PatientService;

import java.util.Map;

@RestController
public class PatientController {

    private static final Logger log = LoggerFactory.getLogger(PatientController.class);

    private final PatientService patientService;

    public PatientController(PatientService patientService) {
        this.patientService = patientService;
    }

    @PostMapping("/patients")
    public Map<String, Object> createPatient(@Valid @RequestBody PatientCreateRequest request) {
        log.info("POST /patients — name={}", request.fullName());
        return patientService.createPatient(request);
    }

    @PostMapping("/patients/{patientId}/conclusion")
    public Map<String, Object> uploadConclusion(
            @PathVariable String patientId,
            @Valid @RequestBody ConclusionUploadRequest request) {
        log.info("POST /patients/{}/conclusion", patientId);
        return patientService.uploadConclusion(patientId, request);
    }

    @GetMapping("/patients/{patientId}/conclusion")
    public Map<String, Object> getConclusion(@PathVariable String patientId) {
        log.debug("GET /patients/{}/conclusion", patientId);
        return patientService.getConclusion(patientId);
    }
}
