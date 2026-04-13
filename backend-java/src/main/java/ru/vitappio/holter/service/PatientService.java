package ru.vitappio.holter.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import ru.vitappio.holter.dto.ConclusionUploadRequest;
import ru.vitappio.holter.dto.PatientCreateRequest;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PatientService {

    private static final Logger log = LoggerFactory.getLogger(PatientService.class);

    private final ConcurrentHashMap<String, Map<String, Object>> patients = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> conclusions = new ConcurrentHashMap<>();

    public Map<String, Object> createPatient(PatientCreateRequest req) {
        String patientId = "p-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        Map<String, Object> patient = Map.of(
                "id", patientId,
                "full_name", req.fullName(),
                "birth_date", req.birthDate(),
                "gender", req.gender(),
                "created_at", Instant.now().toString()
        );
        patients.put(patientId, patient);
        log.info("Patient created: id={}, name={}", patientId, req.fullName());
        return Map.of("patient_id", patientId, "patient", patient);
    }

    public void registerExternalPatient(String patientId, String fullName, String birthDate, String gender) {
        patients.computeIfAbsent(patientId, id -> {
            var patient = new ConcurrentHashMap<String, Object>();
            patient.put("id", id);
            patient.put("full_name", fullName != null ? fullName : "");
            patient.put("birth_date", birthDate != null ? birthDate : "");
            patient.put("gender", gender != null ? gender : "");
            patient.put("created_at", Instant.now().toString());
            return patient;
        });
    }

    public boolean exists(String patientId) {
        return patients.containsKey(patientId);
    }

    public Map<String, Object> uploadConclusion(String patientId, ConclusionUploadRequest req) {
        return uploadConclusion(patientId, "", req);
    }

    public Map<String, Object> uploadConclusion(String patientId, String sessionId, ConclusionUploadRequest req) {
        registerExternalPatient(patientId, "", "", "");
        var conclusion = new ConcurrentHashMap<String, Object>();
        conclusion.put("patient_id", patientId);
        conclusion.put("session_id", sessionId);
        conclusion.put("html_content", req.htmlContent());
        conclusion.put("doctor_name", req.doctorName() != null ? req.doctorName() : "");
        conclusion.put("uploaded_at", Instant.now().toString());

        String key = conclusionKey(patientId, sessionId);
        conclusions.put(key, conclusion);
        log.info("Conclusion uploaded for patient: {}, session: {}", patientId, sessionId);
        return Map.of("ok", true, "conclusion", conclusion);
    }

    public Map<String, Object> getConclusion(String patientId) {
        Map<String, Object> latest = null;
        for (var entry : conclusions.entrySet()) {
            if (entry.getKey().startsWith(patientId + "::")) {
                var c = entry.getValue();
                if (latest == null || String.valueOf(c.get("uploaded_at")).compareTo(String.valueOf(latest.get("uploaded_at"))) > 0) {
                    latest = c;
                }
            }
        }
        if (latest == null) {
            return Map.of("ready", false);
        }
        return Map.of("ready", true, "conclusion", latest);
    }

    public Map<String, Object> getConclusion(String patientId, String sessionId) {
        var conclusion = conclusions.get(conclusionKey(patientId, sessionId));
        if (conclusion == null) {
            return Map.of("ready", false);
        }
        return Map.of("ready", true, "conclusion", conclusion);
    }

    private String conclusionKey(String patientId, String sessionId) {
        return patientId + "::" + (sessionId != null ? sessionId : "");
    }
}
