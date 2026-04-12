package ru.vitappio.holter.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "medom")
public class MedomProperties {

    private String url = "https://medom.virtual-hospital.ru";
    private String login = "";
    private String password = "";

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getLogin() {
        return login;
    }

    public void setLogin(String login) {
        this.login = login;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getApiBase() {
        return url.replaceAll("/+$", "") + "/api/robot";
    }
}
