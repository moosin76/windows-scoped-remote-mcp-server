import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "./config.js";
import type { RemoteDevOAuthProvider } from "./oauth.js";

export function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function createAuthMiddleware(config: AppConfig, oauthProvider?: RemoteDevOAuthProvider) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // If allowNoAuth is explicitly true, allow direct access
    if (config.allowNoAuth) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Unauthorized: Missing or invalid Bearer token in Authorization header",
        },
      });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();

    // 1. Static token match
    if (config.authToken && token === config.authToken) {
      next();
      return;
    }

    // 2. OAuth token verification
    if (oauthProvider) {
      try {
        await oauthProvider.verifyAccessToken(token);
        next();
        return;
      } catch {
        // Fall through to 403
      }
    }

    res.status(403).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Forbidden: Invalid authorization token",
      },
    });
  };
}

