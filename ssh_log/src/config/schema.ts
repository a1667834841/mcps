import { z } from 'zod';

export const LogConfigSchema = z.object({
    name: z.string().min(1, '日志名称不能为空'),
    service: z.string().min(1, '服务名称不能为空'),
    path: z.string().startsWith('/', '日志路径必须是绝对路径'),
});

export const ServerConfigSchema = z.object({
    id: z.string().min(1, '服务器 ID 不能为空'),
    name: z.string().min(1, '服务器名称不能为空'),
    host: z.string().min(1, '主机地址不能为空'),
    port: z.number().int().min(1).max(65535).default(22),
    username: z.string().min(1, '用户名不能为空'),
    password: z.string().min(1, '密码不能为空'),
    logs: z.array(LogConfigSchema).min(1, '至少需要配置一个日志'),
});

export const AppConfigSchema = z.object({
    servers: z.array(ServerConfigSchema).min(1, '至少需要配置一个服务器'),
});

export type ValidatedAppConfig = z.infer<typeof AppConfigSchema>;
