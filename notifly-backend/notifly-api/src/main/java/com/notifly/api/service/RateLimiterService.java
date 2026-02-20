package com.notifly.api.service;

import com.notifly.common.domain.entity.RateLimitConfig;
import com.notifly.common.domain.repository.RateLimitConfigRepository;
import com.notifly.common.exception.RateLimitException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class RateLimiterService {

    private final RedisTemplate<String, String> redisTemplate;
    private final RateLimitConfigRepository rateLimitConfigRepository;

    @Value("${notifly.rate-limit.default-requests-per-minute:60}")
    private Integer defaultRequestsPerMinute;

    @Value("${notifly.rate-limit.default-burst-limit:100}")
    private Integer defaultBurstLimit;

    @Autowired
    public RateLimiterService(RedisTemplate<String, String> redisTemplate, 
                              RateLimitConfigRepository rateLimitConfigRepository) {
        this.redisTemplate = redisTemplate;
        this.rateLimitConfigRepository = rateLimitConfigRepository;
    }

    public void checkRateLimit(UUID tenantId, String apiKey) throws RateLimitException {
        RateLimitConfig config = rateLimitConfigRepository.findByTenantId(tenantId)
                .orElse(RateLimitConfig.builder()
                        .requestsPerMinute(defaultRequestsPerMinute)
                        .burstLimit(defaultBurstLimit)
                        .build());

        String key = "rate_limit:" + tenantId + ":" + apiKey;
        long currentTime = Instant.now().toEpochMilli();
        long windowStart = currentTime - 60000; // 60 seconds ago

        // Sliding window counter using Redis
        // Remove old entries outside the window
        redisTemplate.opsForZSet().removeRangeByScore(key, 0, windowStart);

        // Count requests in current window
        Long count = redisTemplate.opsForZSet().count(key, windowStart, currentTime);
        count = count != null ? count : 0;

        // Check if limit exceeded
        if (count >= config.getRequestsPerMinute()) {
            long retryAfter = 60 - (currentTime - windowStart) / 1000;
            log.warn("Rate limit exceeded for tenant {} on API key {}: {} requests/min", 
                    tenantId, apiKey, count);
            throw new RateLimitException(
                    String.format("Rate limit exceeded. Max %d requests per minute", config.getRequestsPerMinute()),
                    retryAfter
            );
        }

        // Add current request to the window
        redisTemplate.opsForZSet().add(key, String.valueOf(System.nanoTime()), currentTime);
        redisTemplate.expire(key, 61, TimeUnit.SECONDS);

        log.debug("Rate limit check passed for tenant {}: {}/{} requests", 
                tenantId, count + 1, config.getRequestsPerMinute());
    }
}
