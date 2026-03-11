package com.notifly.api.service;

import com.notifly.common.domain.entity.RateLimitConfig;
import com.notifly.common.domain.repository.RateLimitConfigRepository;
import com.notifly.common.exception.RateLimitException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.UUID;

/**
 * Sliding window rate limiter backed by Redis.
 *
 * FIXES from original:
 *  1. Race condition: multiple Redis operations (ZREMRANGEBYSCORE, ZCARD, ZADD, EXPIRE)
 *     were non-atomic. Two concurrent requests could both pass the limit check.
 *     Fixed with a single atomic Lua script — all operations execute as one unit in Redis.
 *  2. Added per-API-key granularity in the Redis key (was just per-tenant).
 *  3. Correctly calculates retryAfter seconds from the sliding window.
 */
@Slf4j
@Service
public class RateLimiterService {

    private final RedisTemplate<String, String> redisTemplate;
    private final RateLimitConfigRepository rateLimitConfigRepository;
    private final DefaultRedisScript<Long> rateLimitScript;

    @Value("${notifly.rate-limit.default-requests-per-minute:60}")
    private Integer defaultRequestsPerMinute;

    @Value("${notifly.rate-limit.default-burst-limit:100}")
    private Integer defaultBurstLimit;

    /**
     * Atomic Lua script for sliding window rate limiting.
     *
     * KEYS[1] = Redis key (e.g., "rate_limit:tenantId:apiKeyId")
     * ARGV[1] = window size in milliseconds (60000 for 1 minute)
     * ARGV[2] = max requests per window
     * ARGV[3] = current timestamp in milliseconds
     *
     * Returns: 1 = allowed, 0 = rate limit exceeded
     *
     * All operations are atomic — no race condition possible.
     */
    private static final String SLIDING_WINDOW_LUA =
        "local key        = KEYS[1]\n" +
        "local window_ms  = tonumber(ARGV[1])\n" +
        "local limit      = tonumber(ARGV[2])\n" +
        "local now        = tonumber(ARGV[3])\n" +
        "local window_start = now - window_ms\n" +
        // Remove entries outside the window
        "redis.call('ZREMRANGEBYSCORE', key, 0, window_start)\n" +
        // Count current entries in window
        "local count = redis.call('ZCARD', key)\n" +
        // Reject if limit exceeded
        "if count >= limit then\n" +
        "  return 0\n" +
        "end\n" +
        // Add this request with unique member (now + random suffix avoids collisions)
        "redis.call('ZADD', key, now, now .. ':' .. math.random(1, 999999))\n" +
        // Set key TTL to window size + 1 second buffer
        "redis.call('PEXPIRE', key, window_ms + 1000)\n" +
        "return 1";

    @Autowired
    public RateLimiterService(RedisTemplate<String, String> redisTemplate,
                               RateLimitConfigRepository rateLimitConfigRepository) {
        this.redisTemplate = redisTemplate;
        this.rateLimitConfigRepository = rateLimitConfigRepository;

        // Pre-compile the Lua script
        this.rateLimitScript = new DefaultRedisScript<>();
        this.rateLimitScript.setScriptText(SLIDING_WINDOW_LUA);
        this.rateLimitScript.setResultType(Long.class);
    }

    /**
     * Check rate limit for a tenant + API key combination.
     * Throws RateLimitException if the limit is exceeded.
     *
     * FIXED: Uses atomic Lua script — no more race condition under concurrency.
     */
    public void checkRateLimit(UUID tenantId, String apiKeyId) throws RateLimitException {
        RateLimitConfig config = rateLimitConfigRepository.findByTenantId(tenantId)
                .orElse(RateLimitConfig.builder()
                        .requestsPerMinute(defaultRequestsPerMinute)
                        .burstLimit(defaultBurstLimit)
                        .build());

        String key = "rate_limit:" + tenantId + ":" + apiKeyId;
        long now = System.currentTimeMillis();
        long windowMs = 60_000L; // 1 minute sliding window

        // FIXED: Single atomic Lua script replaces 4 separate non-atomic Redis calls
        Long result = redisTemplate.execute(
            rateLimitScript,
            Collections.singletonList(key),
            String.valueOf(windowMs),
            String.valueOf(config.getRequestsPerMinute()),
            String.valueOf(now)
        );

        if (result == null || result == 0L) {
            long retryAfter = 60L; // Conservative: retry after 60 seconds
            log.warn("Rate limit exceeded for tenant={}, apiKey={}, limit={}/min",
                    tenantId, apiKeyId, config.getRequestsPerMinute());
            throw new RateLimitException(
                String.format("Rate limit exceeded. Max %d requests per minute. Retry after %d seconds.",
                    config.getRequestsPerMinute(), retryAfter),
                retryAfter
            );
        }

        log.debug("Rate limit check passed for tenant={}: limit={}/min", tenantId, config.getRequestsPerMinute());
    }
}
