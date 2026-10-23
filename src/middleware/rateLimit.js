import { logger } from "../utils/logger.js";

/**
 * Extracts the real client IP from the request, respecting reverse proxies and tunnels.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export function getClientIp(req) {
  if (req.ip) {return req.ip;}
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "127.0.0.1";
}

/**
 * Creates an in-memory rate-limiting middleware for Express routes.
 *
 * @param {object} options
 * @param {number} [options.windowMs=60000] - Window size in milliseconds
 * @param {number} [options.max=60] - Maximum requests allowed per window
 * @param {string} [options.message="Too many requests, please try again later."] - Error message
 * @param {number} [options.statusCode=429] - HTTP status code
 * @param {function} [options.keyGenerator=getClientIp] - Function to determine rate limit key
 * @returns {import("express").RequestHandler}
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000,
    max = 60,
    message = "Too many requests, please try again later.",
    statusCode = 429,
    keyGenerator = getClientIp,
  } = options;

  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (record.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, 30 * 1000);
  cleanup.unref?.();

  const middleware = (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    let record = hits.get(key);

    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + windowMs };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", Math.ceil(record.resetAt / 1000));

    if (record.count > max) {
      res.setHeader("Retry-After", String(retryAfter));
      logger.serverWarn?.(
        `Rate limit exceeded for ${key} on ${req.method} ${req.path}`,
      );

      if (req.accepts?.("html") && !req.is?.("application/json")) {
        res.status(statusCode);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(
          `<!doctype html><html><body><h1>429 Too Many Requests</h1><p>${message}</p><p>Retry after ${retryAfter} seconds.</p></body></html>`,
        );
      }

      return res.status(statusCode).json({
        error: "too_many_requests",
        error_description: message,
        retry_after: retryAfter,
      });
    }

    next();
  };

  middleware.reset = (key) => {
    if (key) {hits.delete(key);}
    else {hits.clear();}
  };

  return middleware;
}

/**
 * Tracks consecutive failed authentication attempts by client IP.
 * Used for targeted brute-force protection without penalizing legitimate requests.
 */
export function createAuthFailureTracker(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15-minute lockout window
    maxFailures = 5,           // lock out after 5 consecutive failed attempts
    keyGenerator = getClientIp,
  } = options;

  const failures = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of failures.entries()) {
      if (record.resetAt <= now && record.lockedUntil <= now) {
        failures.delete(key);
      }
    }
  }, 30 * 1000);
  cleanup.unref?.();

  return {
    isBlocked(req) {
      const key = keyGenerator(req);
      const record = failures.get(key);
      if (!record) {return { blocked: false };}

      const now = Date.now();
      if (record.lockedUntil > now) {
        const retryAfter = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
        return { blocked: true, retryAfter, count: record.count };
      }

      if (record.resetAt <= now) {
        failures.delete(key);
        return { blocked: false };
      }

      return { blocked: false };
    },

    recordFailure(req) {
      const key = keyGenerator(req);
      const now = Date.now();
      let record = failures.get(key);

      if (!record || record.resetAt <= now) {
        record = { count: 1, resetAt: now + windowMs, lockedUntil: 0 };
        failures.set(key, record);
      } else {
        record.count += 1;
      }

      if (record.count >= maxFailures) {
        record.lockedUntil = now + windowMs;
        logger.serverWarn?.(
          `Security: IP ${key} locked out for ${windowMs / 1000}s after ${record.count} failed password attempts.`,
        );
      }

      return record;
    },

    recordSuccess(req) {
      const key = keyGenerator(req);
      failures.delete(key);
    },

    reset(key) {
      if (key) {failures.delete(key);}
      else {failures.clear();}
    },
  };
}

/** Preconfigured limiter for POST /authorize */
export const authorizeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20, // 20 requests per minute
  message: "Too many authorization requests. Please slow down.",
});

/** Preconfigured limiter for POST /token */
export const tokenRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60, // 60 token exchanges per minute
  message: "Too many token exchange requests. Please slow down.",
});

/** Preconfigured limiter for dynamic client registration POST /register */
export const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 client registrations per 15 minutes
  message: "Too many client registration requests. Please slow down.",
});

/** Shared brute-force tracker for owner password submissions */
export const ownerPasswordFailureTracker = createAuthFailureTracker({
  windowMs: 15 * 60 * 1000,
  maxFailures: 5,
});
