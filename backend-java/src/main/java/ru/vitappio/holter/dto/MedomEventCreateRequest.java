package ru.vitappio.holter.dto;

import jakarta.validation.constraints.NotBlank;

public record MedomEventCreateRequest(
        int sessionId,
        @NotBlank String text,
        @NotBlank String start,
        String severity,
        String finish
) {
    public MedomEventCreateRequest {
        if (severity == null || severity.isBlank()) severity = "Low";
        if (finish == null) finish = "";
    }
}
