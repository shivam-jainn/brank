import type {
  EventQueue,
  EventQueueMessage,
  EventQueueSubscription,
  QueuedInferenceEvent,
} from "./pipeline";

export type RabbitMqChannel = {
  assertQueue(name: string, options?: Record<string, unknown>): Promise<unknown> | unknown;
  sendToQueue(
    name: string,
    content: Buffer,
    options?: Record<string, unknown>,
  ): boolean;
  prefetch(count: number): Promise<unknown> | unknown;
  consume(
    name: string,
    onMessage: (message: RabbitMqRawMessage | null) => void,
    options?: Record<string, unknown>,
  ): Promise<{ consumerTag: string }> | { consumerTag: string };
  ack(message: RabbitMqRawMessage): void;
  nack(message: RabbitMqRawMessage, allUpTo?: boolean, requeue?: boolean): void;
  cancel(consumerTag: string): Promise<unknown> | unknown;
};

export type RabbitMqRawMessage = {
  content: Buffer;
  properties?: {
    headers?: Record<string, unknown>;
  };
};

export type RabbitMqEventQueueOptions = {
  channel: RabbitMqChannel;
  queueName: string;
  deadLetterQueueName?: string;
  prefetch?: number;
  publishOptions?: Record<string, unknown>;
};

export function createRabbitMqEventQueue(options: RabbitMqEventQueueOptions): EventQueue {
  const prefetch = options.prefetch ?? 50;
  let consumerTag: string | undefined;

  return {
    async publish(event) {
      await options.channel.assertQueue(options.queueName, queueOptions(options));
      options.channel.sendToQueue(
        options.queueName,
        Buffer.from(JSON.stringify(event)),
        {
          persistent: true,
          contentType: "application/json",
          messageId: event.eventId,
          timestamp: Date.now(),
          ...options.publishOptions,
        },
      );
    },
    subscribe(consumer) {
      let closed = false;

      void (async () => {
        await options.channel.assertQueue(options.queueName, queueOptions(options));
        if (options.deadLetterQueueName) {
          await options.channel.assertQueue(options.deadLetterQueueName, { durable: true });
        }
        await options.channel.prefetch(prefetch);
        const result = await options.channel.consume(
          options.queueName,
          (rawMessage) => {
            if (!rawMessage || closed) return;
            const message = toQueueMessage(rawMessage, options.channel);
            void consumer(message);
          },
          { noAck: false },
        );
        consumerTag = result.consumerTag;
      })();

      return {
        async close() {
          closed = true;
          if (consumerTag) await options.channel.cancel(consumerTag);
        },
      } satisfies EventQueueSubscription;
    },
    depth() {
      return 0;
    },
  };
}

function toQueueMessage(
  rawMessage: RabbitMqRawMessage,
  channel: RabbitMqChannel,
): EventQueueMessage {
  const event = JSON.parse(rawMessage.content.toString("utf8")) as QueuedInferenceEvent;

  return {
    event,
    ack() {
      channel.ack(rawMessage);
    },
    nack(requeue) {
      channel.nack(rawMessage, false, requeue);
    },
  };
}

function queueOptions(options: RabbitMqEventQueueOptions): Record<string, unknown> {
  return {
    durable: true,
    arguments: options.deadLetterQueueName
      ? { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": options.deadLetterQueueName }
      : undefined,
  };
}
