package ru.vitappio.holter.dto;

import jakarta.validation.constraints.NotBlank;

public record DoctorLoginRequest(
        @NotBlank String login,
        @NotBlank String password
) {}
