import { Kafka, logLevel } from 'kafkajs';

// Kafka topics for notification processing
export const KAFKA_TOPICS = {
  NOTIFICATIONS: 'notifications',
  NOTIFICATIONS_RETRY_1S: 'notifications.retry.1s',
  NOTIFICATIONS_RETRY_5S: 'notifications.retry.5s',
  NOTIFICATIONS_RETRY_30S: 'notifications.retry.30s',
  NOTIFICATIONS_DLQ: 'notifications.dlq',
} as const;

// Initialize Kafka client
export const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  ssl: process.env.KAFKA_SSL === 'true',
  sasl: process.env.KAFKA_SASL_ENABLED === 'true' ? {
    mechanism: 'scram-sha-256',
    username: process.env.KAFKA_SASL_USERNAME || '',
    password: process.env.KAFKA_SASL_PASSWORD || '',
  } : undefined,
  logLevel: logLevel.ERROR,
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retry: {
    initialRetryTime: 100,
    retries: 8,
    maxRetryTime: 30000,
    multiplier: 2,
  },
});

// Admin client for topic management
export const kafkaAdmin = kafka.admin();

/**
 * Initialize Kafka topics
 * Creates all required topics if they don't exist
 */
export async function initializeKafkaTopics() {
  try {
    await kafkaAdmin.connect();

    const existingTopics = await kafkaAdmin.listTopics();

    const topicsToCreate = Object.values(KAFKA_TOPICS)
      .filter((topic) => !existingTopics.includes(topic))
      .map((topic) => ({
        topic,
        numPartitions: 10,
        replicationFactor: 3,
        configEntries: [
          { name: 'retention.ms', value: '604800000' }, // 7 days
          { name: 'min.insync.replicas', value: '2' },
        ],
      }));

    if (topicsToCreate.length > 0) {
      await kafkaAdmin.createTopics({ topics: topicsToCreate });
      console.log('Kafka topics created:', topicsToCreate.map((t) => t.topic));
    }

    await kafkaAdmin.disconnect();
  } catch (error) {
    console.error('Failed to initialize Kafka topics:', error);
    throw error;
  }
}

/**
 * Kafka message headers for tracing and retry logic
 */
export interface KafkaMessageHeaders {
  correlationId: string;
  tenantId: string;
  retryCount: number;
  originalTopic: string;
  timestamp: number;
  requestId: string;
}

/**
 * Format headers for Kafka message
 */
export function formatKafkaHeaders(headers: KafkaMessageHeaders): Record<string, string> {
  return {
    'correlation-id': headers.correlationId,
    'tenant-id': headers.tenantId,
    'retry-count': String(headers.retryCount),
    'original-topic': headers.originalTopic,
    'timestamp': String(headers.timestamp),
    'request-id': headers.requestId,
  };
}

/**
 * Parse headers from Kafka message
 */
export function parseKafkaHeaders(headers: Record<string, any>): KafkaMessageHeaders {
  return {
    correlationId: headers['correlation-id']?.toString() || '',
    tenantId: headers['tenant-id']?.toString() || '',
    retryCount: parseInt(headers['retry-count']?.toString() || '0', 10),
    originalTopic: headers['original-topic']?.toString() || '',
    timestamp: parseInt(headers['timestamp']?.toString() || String(Date.now()), 10),
    requestId: headers['request-id']?.toString() || '',
  };
}

/**
 * Producer client for publishing notifications
 */
export const kafkaProducer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5,
  compression: 1, // Gzip
});

/**
 * Publish notification to Kafka
 */
export async function publishNotification(
  tenantId: string,
  requestId: string,
  payload: any,
  correlationId: string,
  retryCount: number = 0,
  originalTopic: string = KAFKA_TOPICS.NOTIFICATIONS
) {
  try {
    if (!kafkaProducer.isConnected()) {
      await kafkaProducer.connect();
    }

    const headers = formatKafkaHeaders({
      correlationId,
      tenantId,
      retryCount,
      originalTopic,
      timestamp: Date.now(),
      requestId,
    });

    await kafkaProducer.send({
      topic: originalTopic,
      messages: [
        {
          key: requestId,
          value: JSON.stringify(payload),
          headers,
          partition: Math.abs(requestId.charCodeAt(0)) % 10, // Partition by request ID for ordering
        },
      ],
      timeout: 30000,
      compression: 1,
    });

    console.log(`Published notification: requestId=${requestId}, topic=${originalTopic}, retryCount=${retryCount}`);
  } catch (error) {
    console.error('Failed to publish notification to Kafka:', error);
    throw error;
  }
}

/**
 * Get retry topic based on attempt number
 */
export function getRetryTopic(attemptNumber: number): string {
  const topicMap: Record<number, string> = {
    0: KAFKA_TOPICS.NOTIFICATIONS, // Initial attempt
    1: KAFKA_TOPICS.NOTIFICATIONS_RETRY_1S,
    2: KAFKA_TOPICS.NOTIFICATIONS_RETRY_5S,
    3: KAFKA_TOPICS.NOTIFICATIONS_RETRY_30S,
    4: KAFKA_TOPICS.NOTIFICATIONS_DLQ, // Dead Letter Queue
  };

  return topicMap[attemptNumber] || KAFKA_TOPICS.NOTIFICATIONS_DLQ;
}

/**
 * Get retry delay in milliseconds based on attempt
 */
export function getRetryDelay(attemptNumber: number): number {
  const delays: Record<number, number> = {
    0: 0, // Immediate
    1: 1000, // 1 second
    2: 5000, // 5 seconds
    3: 30000, // 30 seconds
    4: 0, // No retry after this
  };

  return delays[attemptNumber] || 0;
}
