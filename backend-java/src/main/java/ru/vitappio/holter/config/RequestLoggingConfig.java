package ru.vitappio.holter.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Configuration
public class RequestLoggingConfig {

    @Bean
    public OncePerRequestFilter requestLoggingFilter() {
        return new OncePerRequestFilter() {
            private final Logger log = LoggerFactory.getLogger("http.access");

            @Override
            protected void doFilterInternal(HttpServletRequest request,
                                            HttpServletResponse response,
                                            FilterChain chain)
                    throws ServletException, IOException {
                long start = System.currentTimeMillis();
                try {
                    chain.doFilter(request, response);
                } finally {
                    long duration = System.currentTimeMillis() - start;
                    log.info("{} {} {} — {}ms",
                            request.getMethod(),
                            request.getRequestURI(),
                            response.getStatus(),
                            duration);
                }
            }
        };
    }
}
