import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
    level: process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info'),
    transport: isProduction ? undefined : {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: true,
        },
    },
});

export function withLogging<T extends any[], R>(
    handler: (...args: T) => Promise<R> | R
): (...args: T) => Promise<R> {
    return async (...args: T) => {
        const startTime = Date.now();
        const req = args[0] as Request | undefined;

        let method = 'GET';
        let urlPath = '';

        if (req && typeof req.url === 'string') {
            method = req.method || 'GET';
            try {
                const parsedUrl = new URL(req.url);
                urlPath = parsedUrl.pathname + parsedUrl.search;
            } catch {
                urlPath = req.url;
            }
        }

        try {
            const result = await handler(...args);
            const duration = Date.now() - startTime;

            let status = 200;
            if (result instanceof Response) {
                status = result.status;
            }

            logger.info(
                {
                    'http.response.status_code': status,
                    'http.request.method': method,
                    'url.path': urlPath,
                    'duration_ms': duration,
                },
                `${method} ${urlPath} - ${status} in ${duration}ms`
            );

            return result;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            const status = error.status || 500;

            logger.error(
                {
                    err: error,
                    'http.response.status_code': status,
                    'http.request.method': method,
                    'url.path': urlPath,
                    'duration_ms': duration,
                },
                `Error handling request ${method} ${urlPath} - ${status} in ${duration}ms`
            );

            throw error;
        }
    };
}
