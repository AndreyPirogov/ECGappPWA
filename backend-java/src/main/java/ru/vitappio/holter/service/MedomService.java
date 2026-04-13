package ru.vitappio.holter.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import ru.vitappio.holter.config.MedomProperties;
import ru.vitappio.holter.exception.BadRequestException;
import ru.vitappio.holter.exception.MedomProxyException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MedomService {

    private static final Logger log = LoggerFactory.getLogger(MedomService.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private final WebClient webClient;
    private final MedomProperties props;

    private final ConcurrentHashMap<String, String> cookieJar = new ConcurrentHashMap<>();
    private volatile String cachedLogin = "";
    private volatile String cachedPassword = "";

    public MedomService(WebClient medomWebClient, MedomProperties props) {
        this.webClient = medomWebClient;
        this.props = props;
    }

    public void setCredentials(String login, String password) {
        this.cachedLogin = login;
        this.cachedPassword = password;
    }

    private String getLogin() {
        String l = cachedLogin.isBlank() ? props.getLogin() : cachedLogin;
        if (l.isBlank()) throw new BadRequestException("MEDOM credentials not configured");
        return l;
    }

    private String getPassword() {
        String p = cachedPassword.isBlank() ? props.getPassword() : cachedPassword;
        if (p.isBlank()) throw new BadRequestException("MEDOM credentials not configured");
        return p;
    }

    private String cookieHeader() {
        if (cookieJar.isEmpty()) return "";
        var sb = new StringBuilder();
        cookieJar.forEach((k, v) -> {
            if (!sb.isEmpty()) sb.append("; ");
            sb.append(k).append("=").append(v);
        });
        return sb.toString();
    }

    private void captureCookies(ClientResponse resp) {
        resp.cookies().forEach((name, cookies) ->
                cookies.forEach(c -> cookieJar.put(name, c.getValue()))
        );
    }

    private Mono<String> handleResponse(ClientResponse resp, String operation) {
        captureCookies(resp);
        if (resp.statusCode().isError()) {
            return resp.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMap(body -> {
                        log.error("MEDOM {} error: HTTP {} — {}", operation, resp.statusCode(), body);
                        return Mono.error(new MedomProxyException(
                                "MEDOM " + operation + " failed: HTTP " + resp.statusCode().value() + " — " + body));
                    });
        }
        return resp.bodyToMono(String.class).defaultIfEmpty("");
    }

    public Map<String, Object> login(String loginName, String password) {
        try {
            log.info("MEDOM login attempt: user={}", loginName);
            var form = new LinkedMultiValueMap<String, String>();
            form.add("login", loginName);
            form.add("password", password);

            String response = webClient.post()
                    .uri("/login")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(BodyInserters.fromFormData(form))
                    .exchangeToMono(resp -> handleResponse(resp, "login"))
                    .block();

            try {
                if (response != null && response.trim().startsWith("{")) {
                    return mapper.readValue(response, Map.class);
                }
            } catch (Exception ignored) {}
            return Map.of("ok", true);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM login failed: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> ping() {
        try {
            String body = webClient.get()
                    .uri("/ping")
                    .header("Cookie", cookieHeader())
                    .exchangeToMono(resp -> handleResponse(resp, "ping"))
                    .block();
            return mapper.readValue(body, Map.class);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM ping failed: " + e.getMessage(), e);
        }
    }

    public void autoLogin() {
        try {
            var info = ping();
            if (!Boolean.TRUE.equals(info.get("is_auth"))) {
                login(getLogin(), getPassword());
            }
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            login(getLogin(), getPassword());
        }
    }

    public List<Object> getContracts() {
        autoLogin();
        try {
            String body = webClient.get()
                    .uri("/GetContracts")
                    .header("Cookie", cookieHeader())
                    .exchangeToMono(resp -> handleResponse(resp, "GetContracts"))
                    .block();
            return mapper.readValue(body, List.class);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM GetContracts failed: " + e.getMessage(), e);
        }
    }

    public int createPatient(String lastName, String firstName, String secondName, int isFemale, String birthDate) {
        autoLogin();
        try {
            var form = new LinkedMultiValueMap<String, String>();
            form.add("last_name", lastName);
            form.add("first_name", firstName);
            if (secondName != null && !secondName.isBlank()) form.add("second_name", secondName);
            if (birthDate != null && !birthDate.isBlank()) form.add("birth_date", birthDate);
            form.add("is_female", String.valueOf(isFemale));
            log.debug("MEDOM CreatePatient request: last_name={}, first_name={}, second_name={}, birth_date={}, is_female={}",
                    lastName, firstName, secondName, birthDate, isFemale);

            String body = webClient.post()
                    .uri("/CreatePatient")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .header("Cookie", cookieHeader())
                    .body(BodyInserters.fromFormData(form))
                    .exchangeToMono(resp -> handleResponse(resp, "CreatePatient"))
                    .block();
            log.info("MEDOM patient created: response={}", body);
            return mapper.readValue(body, Integer.class);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM CreatePatient failed: " + e.getMessage(), e);
        }
    }

    public List<Object> getDevices() {
        autoLogin();
        try {
            String body = webClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/GetDevices").queryParam("take", 100).build())
                    .header("Cookie", cookieHeader())
                    .exchangeToMono(resp -> handleResponse(resp, "GetDevices"))
                    .block();
            log.info("MEDOM GetDevices response ({} chars): {}", body == null ? 0 : body.length(), body);
            return mapper.readValue(body, List.class);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM GetDevices failed: " + e.getMessage(), e);
        }
    }

    public int createSession(int patientId, int deviceId, String comment) {
        autoLogin();
        try {
            var form = new LinkedMultiValueMap<String, String>();
            form.add("patientId", String.valueOf(patientId));
            form.add("deviceId", String.valueOf(deviceId));
            if (comment != null && !comment.isBlank()) form.add("comment", comment);

            log.info("MEDOM CreateSession request: patientId={}, deviceId={}, form={}, cookies={}",
                    patientId, deviceId, form.toSingleValueMap(), cookieJar.keySet());

            String body = webClient.post()
                    .uri("/CreateSession")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .header("Cookie", cookieHeader())
                    .body(BodyInserters.fromFormData(form))
                    .exchangeToMono(resp -> handleResponse(resp, "CreateSession"))
                    .block();
            log.info("MEDOM session created: response={}", body);
            return mapper.readValue(body, Integer.class);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM CreateSession failed: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> finishSession(int sessionId) {
        autoLogin();
        try {
            var form = new LinkedMultiValueMap<String, String>();
            form.add("sessionId", String.valueOf(sessionId));

            String body = webClient.post()
                    .uri("/FinishSession")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .header("Cookie", cookieHeader())
                    .body(BodyInserters.fromFormData(form))
                    .exchangeToMono(resp -> handleResponse(resp, "FinishSession"))
                    .block();

            try {
                if (body != null && body.trim().startsWith("{")) {
                    return mapper.readValue(body, Map.class);
                }
            } catch (Exception ignored) {}
            return Map.of("ok", true);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM FinishSession failed: " + e.getMessage(), e);
        }
    }

    public int addUserEvent(int sessionId, String text, String start, String severity, String finish) {
        autoLogin();
        try {
            var form = new LinkedMultiValueMap<String, String>();
            form.add("sessionId", String.valueOf(sessionId));
            form.add("text", text);
            form.add("severity", severity);
            form.add("start", start);
            if (finish != null && !finish.isBlank()) form.add("finish", finish);

            log.info("MEDOM AddUserEvent request: sessionId={}, text={}, start={}, severity={}, finish={}",
                    sessionId, text, start, severity, finish);

            String body = webClient.post()
                    .uri("/AddUserEvent")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .header("Cookie", cookieHeader())
                    .body(BodyInserters.fromFormData(form))
                    .exchangeToMono(resp -> handleResponse(resp, "AddUserEvent"))
                    .block();
            log.info("MEDOM AddUserEvent response: {}", body);
            if (body != null && body.trim().startsWith("{")) {
                var map = mapper.readValue(body, Map.class);
                Object id = map.getOrDefault("Id", map.getOrDefault("id", map.getOrDefault("EventId", 0)));
                return id instanceof Number ? ((Number) id).intValue() : Integer.parseInt(id.toString());
            }
            return mapper.readValue(body, Integer.class);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM AddUserEvent failed: " + e.getMessage(), e);
        }
    }

    public List<Object> getSessions(Integer patientId, Integer sessionId) {
        autoLogin();
        try {
            String body = webClient.get()
                    .uri(uriBuilder -> {
                        var builder = uriBuilder.path("/GetSessions").queryParam("take", 50);
                        if (patientId != null) builder.queryParam("patientId", patientId);
                        if (sessionId != null) builder.queryParam("sessionId", sessionId);
                        return builder.build();
                    })
                    .header("Cookie", cookieHeader())
                    .exchangeToMono(resp -> handleResponse(resp, "GetSessions"))
                    .block();
            return mapper.readValue(body, List.class);
        } catch (MedomProxyException e) {
            throw e;
        } catch (Exception e) {
            throw new MedomProxyException("MEDOM GetSessions failed: " + e.getMessage(), e);
        }
    }

    private static final DateTimeFormatter[] ISO_FORMATS = {
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSS"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"),
    };
    private static final DateTimeFormatter MEDOM_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    public static String formatEventDate(String isoOrDate) {
        if (isoOrDate == null || isoOrDate.isBlank()) return isoOrDate;
        String clean = isoOrDate.endsWith("Z") ? isoOrDate.substring(0, isoOrDate.length() - 1) : isoOrDate;
        for (var fmt : ISO_FORMATS) {
            try {
                return LocalDateTime.parse(clean, fmt).format(MEDOM_FORMAT);
            } catch (DateTimeParseException ignored) {}
        }
        return isoOrDate;
    }
}
