package ru.vitappio.holter.dto;

import jakarta.validation.constraints.NotBlank;

public record MedomPatientCreateRequest(
        @NotBlank String lastName,
        @NotBlank String firstName,
        String secondName,
        int isFemale,
        String birthDate
) {
    public MedomPatientCreateRequest {
        if (secondName == null) secondName = "";
        if (birthDate == null) birthDate = "";
    }
}
