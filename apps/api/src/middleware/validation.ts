// ── Perfect Request Validation ─────────────────────────────────────
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errorHandler.js';

export function validateBody(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req.body, { 
        abortEarly: false,
        stripUnknown: true 
      });
      
      if (error) {
        const details = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        throw new ValidationError('Validation failed', details);
      }
      
      req.body = value;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateQuery(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        const details = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        throw new ValidationError('Query validation failed', details);
      }
      
      req.query = value;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateParams(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req.params, {
        abortEarly: false
      });
      
      if (error) {
        const details = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        throw new ValidationError('Parameter validation failed', details);
      }
      
      req.params = value;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Security headers middleware
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
}

// Rate limiting middleware
export function rateLimiter(maxRequests: number = 100, windowMs: number = 60000) {
  const requests = new Map<string, number[]>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old requests
    const userRequests = requests.get(ip) || [];
    const validRequests = userRequests.filter(time => time > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded',
          statusCode: 429,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    validRequests.push(now);
    requests.set(ip, validRequests);
    
    next();
  };
}

// Request ID middleware
export function requestId(_req: Request, res: Response, next: NextFunction) {
  req.id = req.headers['x-request-id'] as string || 
            `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
}