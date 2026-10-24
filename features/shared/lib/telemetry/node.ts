import { metrics } from "@opentelemetry/api"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import {
  detectResources,
  envDetector,
  resourceFromAttributes,
} from "@opentelemetry/resources"
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics"
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node"

/**
 * Registers OTLP/HTTP trace and metric exporters for the Node.js runtime.
 * Next.js already emits spans for every request through the global API, so
 * registering a provider is all it takes to export them.
 *
 * The exporters read `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`
 * and their per-signal variants from the environment themselves. The metric
 * reader does not, so `OTEL_METRIC_EXPORT_INTERVAL` is passed on here.
 */
export function startTelemetry(serviceName: string) {
  const exportIntervalMillis =
    Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || undefined

  const resource = detectResources({ detectors: [envDetector] }).merge(
    resourceFromAttributes({ "service.name": serviceName })
  )

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  })
  tracerProvider.register()

  metrics.setGlobalMeterProvider(
    new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
          exportIntervalMillis,
        }),
      ],
    })
  )
}
