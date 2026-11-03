{{- define "scada.labels" -}}
app.kubernetes.io/name: scada
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "scada.device" -}}
{{- $serial := regexFind "/dev/tty[A-Za-z0-9]+" . -}}
{{- if $serial -}}
{{- $serial -}}
{{- else -}}
{{- . -}}
{{- end -}}
{{- end }}

{{- define "scada.slug" -}}
{{- regexReplaceAll "[^A-Za-z0-9]+" . "-" | trimAll "-" | lower -}}
{{- end }}

{{- define "scada.routingKey" -}}
{{- if eq . "*" -}}
#
{{- else if hasSuffix "/*" . -}}
{{- printf "%s.#" (replace "/" "." (trimSuffix "/*" .)) -}}
{{- else -}}
{{- replace "/" "." . -}}
{{- end -}}
{{- end }}

{{- define "scada.linkEnv" -}}
- name: SINK_DB_PROFILE
  value: {{ .Values.role | quote }}
{{- if .Values.postgres.enabled }}
- name: POSTGRES_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.postgres.secret }}
      key: url
- name: POSTGRES_ADMIN_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.postgres.secret }}
      key: adminUrl
{{- end }}
{{- if .Values.rabbitmq.enabled }}
- name: STOMP_URL
  value: {{ printf "stomp://%s-rabbitmq:61613" .Release.Name | quote }}
- name: STOMP_LOGIN
  value: guest
- name: STOMP_PASSCODE
  value: guest
- name: STOMP_HOST
  value: /
- name: AMQP_URL
  value: {{ printf "amqp://guest:guest@%s-rabbitmq:5672" .Release.Name | quote }}
{{- end }}
{{- if .Values.clickhouse.enabled }}
- name: CLICKHOUSE_HOST
  value: {{ printf "%s-clickhouse" .Release.Name | quote }}
- name: CLICKHOUSE_URL
  value: {{ printf "http://%s-clickhouse:8123" .Release.Name | quote }}
{{- end }}
{{- end }}
