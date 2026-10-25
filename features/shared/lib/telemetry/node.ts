import { context, metrics, propagation, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core"
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
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace"

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

  // What the 2.x `NodeTracerProvider.register()` did: spans follow async work,
  // and W3C trace context and baggage travel with requests.
  const contextManager = new AsyncLocalStorageContextManager()
  contextManager.enable()
  context.setGlobalContextManager(contextManager)
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    })
  )
  trace.setGlobalTracerProvider(
    new TracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor({ exporter: new OTLPTraceExporter() }),
      ],
    })
  )

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
