package ru.vitappio.holter.exception;

public class MedomProxyException extends RuntimeException {

    public MedomProxyException(String message) {
        super(message);
    }

    public MedomProxyException(String message, Throwable cause) {
        super(message, cause);
    }
}
