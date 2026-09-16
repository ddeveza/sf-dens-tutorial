// Dev/test provider: prints the message to stdout (or the injected sink) and always "succeeds".
import { errorMessage } from '../errors.ts';
import type { EmailProvider } from '../types.ts';

export interface ConsoleProviderOptions {
  /** Line sink; defaults to `console.info`. */
  write?: (line: string) => void;
}

export function createConsoleProvider(options: ConsoleProviderOptions = {}): EmailProvider {
  const write = options.write ?? ((line: string) => console.info(line));
  let sequence = 0;
  return {
    name: 'console',
    async send(msg) {
      try {
        sequence += 1;
        const id = `console-${sequence}`;
        write(
          [
            `--- email ${id} (console provider, nothing was sent) ---`,
            `To: ${msg.to}`,
            `Subject: ${msg.subject}`,
            '',
            msg.text,
            `--- end ${id} ---`,
          ].join('\n'),
        );
        return { id };
      } catch (e) {
        return { error: errorMessage(e) };
      }
    },
  };
}
