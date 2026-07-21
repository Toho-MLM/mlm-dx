import { connect } from 'cloudflare:sockets';
import type { Bindings } from '../index';

type SmtpSecurity = 'tls' | 'starttls';

type SmtpConfig = {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

export type MailMessage = {
  to: { email: string; name?: string };
  cc?: Array<{ email: string; name?: string }>;
  subject: string;
  text: string;
  html: string;
};

type SmtpResponse = {
  code: number;
  message: string;
};

class SmtpResponseReader {
  private readonly decoder = new TextDecoder();
  private buffer = '';

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  private async readLine(): Promise<string> {
    const lineEnd = this.buffer.indexOf('\r\n');
    if (lineEnd >= 0) {
      const line = this.buffer.slice(0, lineEnd);
      this.buffer = this.buffer.slice(lineEnd + 2);
      return line;
    }

    const { done, value } = await this.reader.read();
    if (done) {
      const remaining = this.buffer;
      this.buffer = '';
      if (remaining) return remaining;
      throw new Error('SMTP_CONNECTION_CLOSED');
    }
    this.buffer += this.decoder.decode(value, { stream: true });
    return this.readLine();
  }

  async readResponse(): Promise<SmtpResponse> {
    const firstLine = await this.readLine();
    const match = /^(\d{3})([ -])(.*)$/.exec(firstLine);
    if (!match) throw new Error('SMTP_INVALID_RESPONSE');

    const code = Number(match[1]);
    const messages = [match[3]];
    if (match[2] === '-') {
      let complete = false;
      while (!complete) {
        const line = await this.readLine();
        const continuation = /^(\d{3})([ -])(.*)$/.exec(line);
        messages.push(continuation?.[3] ?? line);
        complete = Boolean(continuation && Number(continuation[1]) === code && continuation[2] === ' ');
      }
    }

    return { code, message: messages.join('\n') };
  }
}

function readConfig(env: Bindings): SmtpConfig | null {
  const values = [
    env.SMTP_HOST,
    env.SMTP_PORT,
    env.SMTP_SECURITY,
    env.SMTP_USER,
    env.SMTP_PASSWORD,
    env.SMTP_FROM_EMAIL,
    env.SMTP_FROM_NAME,
  ];
  if (values.some((value) => !value?.trim())) return null;

  const port = Number(env.SMTP_PORT);
  const security = env.SMTP_SECURITY as SmtpSecurity;
  if (!Number.isInteger(port) || ![465, 587].includes(port)) throw new Error('SMTP_INVALID_PORT');
  if (security !== 'tls' && security !== 'starttls') throw new Error('SMTP_INVALID_SECURITY');
  if ((port === 465 && security !== 'tls') || (port === 587 && security !== 'starttls')) {
    throw new Error('SMTP_INVALID_SECURITY_PORT_COMBINATION');
  }

  return {
    host: env.SMTP_HOST!,
    port,
    security,
    user: env.SMTP_USER!,
    password: env.SMTP_PASSWORD!,
    fromEmail: env.SMTP_FROM_EMAIL!,
    fromName: env.SMTP_FROM_NAME!,
  };
}

function assertSafeHeader(value: string): string {
  if (/\r|\n/.test(value)) throw new Error('INVALID_MAIL_HEADER');
  return value.trim();
}

function assertEmail(value: string): string {
  const email = assertSafeHeader(value);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw new Error('INVALID_EMAIL_ADDRESS');
  return email;
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value: string): string {
  const encoded = utf8Base64(value);
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${utf8Base64(assertSafeHeader(value))}?=`;
}

function formatAddress(address: { email: string; name?: string }): string {
  const email = assertEmail(address.email);
  return address.name ? `${encodeHeader(address.name)} <${email}>` : `<${email}>`;
}

function buildMimeMessage(config: SmtpConfig, message: MailMessage): string {
  const boundary = `mlm-dx-${crypto.randomUUID()}`;
  const cc = message.cc ?? [];
  const headers = [
    `From: ${formatAddress({ email: config.fromEmail, name: config.fromName })}`,
    `To: ${formatAddress(message.to)}`,
    ...(cc.length > 0 ? [`Cc: ${cc.map(formatAddress).join(', ')}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${config.host}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(message.html),
    `--${boundary}--`,
    '',
  ];

  return headers.join('\r\n').replace(/^\./gm, '..');
}

async function expectResponse(responseReader: SmtpResponseReader, expectedCodes: number[]): Promise<SmtpResponse> {
  const response = await responseReader.readResponse();
  if (!expectedCodes.includes(response.code)) throw new Error(`SMTP_RESPONSE_${response.code}`);
  return response;
}

async function writeCommand(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  responseReader: SmtpResponseReader,
  command: string,
  expectedCodes: number[]
): Promise<SmtpResponse> {
  await writer.write(new TextEncoder().encode(`${command}\r\n`));
  return expectResponse(responseReader, expectedCodes);
}

async function authenticate(
  config: SmtpConfig,
  capabilities: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  responseReader: SmtpResponseReader
): Promise<void> {
  const upperCapabilities = capabilities.toUpperCase();
  if (upperCapabilities.includes('AUTH') && upperCapabilities.includes('PLAIN')) {
    const encoded = utf8Base64(`\0${config.user}\0${config.password}`);
    const response = await writeCommand(writer, responseReader, `AUTH PLAIN ${encoded}`, [235, 334]);
    if (response.code === 334) await writeCommand(writer, responseReader, encoded, [235]);
    return;
  }

  if (upperCapabilities.includes('AUTH') && upperCapabilities.includes('LOGIN')) {
    await writeCommand(writer, responseReader, 'AUTH LOGIN', [334]);
    await writeCommand(writer, responseReader, utf8Base64(config.user), [334]);
    await writeCommand(writer, responseReader, utf8Base64(config.password), [235]);
    return;
  }

  throw new Error('SMTP_AUTH_NOT_SUPPORTED');
}

export async function sendMail(env: Bindings, message: MailMessage): Promise<'sent' | 'skipped'> {
  const config = readConfig(env);
  if (!config) return 'skipped';

  let socket: ReturnType<typeof connect> = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: config.security === 'tls' ? 'on' : 'starttls', allowHalfOpen: false }
  );
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  try {
    await socket.opened;
    let activeReader = socket.readable.getReader();
    let activeWriter = socket.writable.getWriter();
    reader = activeReader;
    writer = activeWriter;
    let responseReader = new SmtpResponseReader(activeReader);

    await expectResponse(responseReader, [220]);
    let ehlo = await writeCommand(activeWriter, responseReader, 'EHLO mlm-dx-worker', [250]);

    if (config.security === 'starttls') {
      await writeCommand(activeWriter, responseReader, 'STARTTLS', [220]);
      activeReader.releaseLock();
      activeWriter.releaseLock();
      socket = socket.startTls();
      await socket.opened;
      activeReader = socket.readable.getReader();
      activeWriter = socket.writable.getWriter();
      reader = activeReader;
      writer = activeWriter;
      responseReader = new SmtpResponseReader(activeReader);
      ehlo = await writeCommand(activeWriter, responseReader, 'EHLO mlm-dx-worker', [250]);
    }

    await authenticate(config, ehlo.message, activeWriter, responseReader);
    await writeCommand(activeWriter, responseReader, `MAIL FROM:<${assertEmail(config.fromEmail)}>`, [250]);

    const recipients = [message.to, ...(message.cc ?? [])];
    const uniqueRecipients = [...new Set(recipients.map((recipient) => assertEmail(recipient.email).toLowerCase()))];
    for (const email of uniqueRecipients) {
      await writeCommand(activeWriter, responseReader, `RCPT TO:<${email}>`, [250, 251]);
    }

    await writeCommand(activeWriter, responseReader, 'DATA', [354]);
    await activeWriter.write(new TextEncoder().encode(`${buildMimeMessage(config, message)}\r\n.` + '\r\n'));
    await expectResponse(responseReader, [250]);
    await writeCommand(activeWriter, responseReader, 'QUIT', [221]);
    return 'sent';
  } finally {
    try {
      reader?.releaseLock();
      writer?.releaseLock();
      await socket.close();
    } catch {
      // The SMTP server may close the connection immediately after QUIT.
    }
  }
}
