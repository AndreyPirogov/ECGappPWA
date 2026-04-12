package ru.vitappio.holter.dto;

import jakarta.validation.constraints.NotBlank;

public record ConclusionUploadRequest(
        @NotBlank String htmlContent,
        String doctorName
) {}
