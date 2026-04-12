package ru.vitappio.holter.dto;

public record MedomSessionCreateRequest(
        int patientId,
        int deviceId,
        String comment
) {
    public MedomSessionCreateRequest {
        if (comment == null) comment = "";
    }
}
