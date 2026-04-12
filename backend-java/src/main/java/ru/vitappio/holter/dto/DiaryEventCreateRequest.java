package ru.vitappio.holter.dto;

import jakarta.validation.constraints.NotBlank;

public record DiaryEventCreateRequest(
        @NotBlank String sessionId,
        @NotBlank String eventType,
        @NotBlank String timestamp
) {}
