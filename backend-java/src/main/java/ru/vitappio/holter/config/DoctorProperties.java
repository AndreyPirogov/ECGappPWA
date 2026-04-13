package ru.vitappio.holter.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "doctor")
public class DoctorProperties {

    private String login = "doctor";
    private String password = "doctor123";

    public String getLogin() { return login; }
    public void setLogin(String login) { this.login = login; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
