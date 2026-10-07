{{/* Chart name (overridable) */}}
{{- define "devopscopilot.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fully-qualified name, avoiding release-name duplication */}}
{{- define "devopscopilot.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Common labels */}}
{{- define "devopscopilot.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "devopscopilot.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Agent selector labels */}}
{{- define "devopscopilot.agent.selectorLabels" -}}
app.kubernetes.io/name: {{ include "devopscopilot.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: cluster-agent
{{- end -}}

{{/* Agent ServiceAccount name */}}
{{- define "devopscopilot.agent.serviceAccountName" -}}
{{- printf "%s-agent" (include "devopscopilot.fullname" .) -}}
{{- end -}}

{{/* Secret name the agent reads identity from */}}
{{- define "devopscopilot.secretName" -}}
{{- if .Values.secret.existingSecret -}}
{{- .Values.secret.existingSecret -}}
{{- else -}}
{{- printf "%s-agent" (include "devopscopilot.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/* Prometheus in-cluster service name */}}
{{- define "devopscopilot.prometheus.fullname" -}}
{{- printf "%s-prometheus" (include "devopscopilot.fullname" .) -}}
{{- end -}}

{{/*
Effective Prometheus URL for the agent:
- explicit config.prometheusUrl wins
- else the bundled Prometheus service when monitoring is enabled
- else empty (agent must be pointed at an external Prometheus)
*/}}
{{- define "devopscopilot.effectivePrometheusUrl" -}}
{{- if .Values.config.prometheusUrl -}}
{{- .Values.config.prometheusUrl -}}
{{- else if .Values.monitoring.enabled -}}
{{- printf "http://%s.%s.svc.cluster.local:%v" (include "devopscopilot.prometheus.fullname" .) .Release.Namespace .Values.monitoring.prometheus.service.port -}}
{{- end -}}
{{- end -}}

{{/* OpenCost selector labels (mirrors the agent's convention) */}}
{{- define "devopscopilot.opencost.selectorLabels" -}}
app.kubernetes.io/name: {{ include "devopscopilot.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: opencost
{{- end -}}
