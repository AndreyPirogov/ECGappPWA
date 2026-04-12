package ru.vitappio.holter.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SessionCreateRequest(
        @NotBlank String patientId,
        @NotBlank @Size(min = 2) String deviceSerial
) {}
