package ru.vitappio.holter.dto;

import jakarta.validation.constraints.NotBlank;

public record MedomCredentialsRequest(
        @NotBlank String login,
        @NotBlank String password
) {}
