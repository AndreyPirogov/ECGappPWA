package ru.vitappio.holter.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PatientCreateRequest(
        @NotBlank @Size(min = 2) String fullName,
        @NotBlank String birthDate,
        @NotBlank String gender
) {}
