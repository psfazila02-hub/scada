# Deploy DSL

Two levels.

The **system document** is one file for the whole plant: every machine, every server, every app. A plant package stores that file and does not project it itself. `readDocument(text)` parses the YAML subset the document uses: maps, lists, and scalars.

A **release** is one Helm install of `charts/scada` into one cluster. `releases(document, cluster)` cuts the system document down to the values of that cluster. One release never describes a second cluster.

The chart does not know furnaces or HMI. Extra keys on a machine are opaque: they are copied through and the plant process reads them.

## System document

A server has four parts. Each part is optional.

| Part | What it answers |
|---|---|
| `ownership` | state of an object this server edits. The same object on several servers is one fault-tolerant set. This is not telemetry |
| `fan_in` | one flow into this server. It has no state |
| `fan_out` | one flow out of this server |
| `api` | services other servers may call. `plant` is the plant HTTP API. `bus` is the message bus those servers open. A bus url carries no password. A panel that only the local HMI uses is not an api |

Telemetry lives in `fan_in` and has no state. `ownership` is state this server edits. A server may omit any part.

A flow has two fields, plus `mapping` when a device publishes several parameters. One flow has one name. Several names are several flows.

| Field | On `fan_in` | On `fan_out` |
|---|---|---|
| `from` | a server id or one device address. A collector nickname is not a server. The address includes the line settings and the identity of that one device. A register window is `?at=1280&count=30`. A pattern in `name` is allowed only when every match is that same device | this server, so the field is omitted |
| `mapping` | a point map, or the id of one in `mappings`. A key is a parameter id. The value is that parameter's point on the device: a register, an OPC UA node, or a column. Omitted for a server, and for a parameter that is the whole reading. An unknown id is an error. A key that is not under `name` is an error | omitted |
| `name` | path of one parameter, or of a group that stands for every parameter under it. The object is the namespace node listed in `objects`. The object path alone is an error. `*` matches any remainder of the path, including `/`. A `fan_out` name keeps streams this server already has and does not add names from the rest of the namespace. `{a,b}` lists alternatives for one segment. Brace groups in one path expand together. A fixed `from` applies to every expanded name | the same path |
| `to` | this server, so the field is omitted | the server that receives the flow |

Flows differ. A place and a list of fed machines are not fields of a flow. `from` is only the address. `mapping` is only the point map. Neither key shares its handler with the other.

### Templates

`templates` names a reusable node list. The key is the name. The value is the list. A template is names only: an entry has an `id` and, when it is a group, `nodes`. It has no address and no point.

A namespace node with `template` takes that list as its children. Its own `nodes` patch the list. A node with no `template` is not a patch: its `nodes` are the children. A template name that is missing is an error.

| Patch | Effect |
|---|---|
| id the list does not have | added |
| `enabled: false` on an id the list has | removed |
| `enabled: false` on an id the list lacks | not added |
| any other entry | stays; its `nodes`, if present, patch the children the same way |

The same id twice in one patch is an error.

```yaml
templates:
  unit:
    - id: electrical
      nodes:
        - id: voltage
        - id: step
```

```yaml
- id: unit-2
  template: unit
  nodes:
    - id: rotation_on
    - id: electrical
      nodes:
        - id: step
          enabled: false
```

That patch adds `rotation_on`, keeps `voltage`, and removes `step`. A mapping key has to name a path that remains.

### Mappings

`mappings` is a catalog of point maps. A flow `mapping` is an inline map, or an id in that catalog. Several flows may share one id. The point map is not part of the name tree.

A key is a parameter id under the flow `name`. The joined path is `name` + `/` + key, and that path must be in the namespace. The value is the point on that device: a register, an OPC UA node, or a column. Omit `mapping` on a server-to-server flow, and when the parameter is the whole reading. An unknown id is an error. A key that is not under `name` is an error.

```yaml
mappings:
  drive:
    voltage: holding:40001
    step: coil:1
```

```yaml
- from: modbus://192.0.2.11:502
  mapping: drive
  name: mill/hall/unit-2/electrical
```

`voltage` is `mill/hall/unit-2/electrical/voltage`. The inline form is the same map in place of the id `drive`. The mill document below takes `unit` as-is and names `drive` on each device flow. Flows whose `from` is a server omit `mapping`.

`modbus-to-mqtt` publishes each holding point as MQTT JSON `{ts, value}` on that document path. The number in `holding:<pdu>` is the PDU address, the same scale as `?at=`. `:abcd` and `:cdab` select a float32 word order. A bare `holding:<pdu>` is one uint16. The poll window is `?at=` and `count` on the address, or the span of the holding points when those are omitted. One process shares one window. `coil:` stays a document point and is not read by this collector. Chart `collectors[].mapping` must already be these holding points. A plant driver may rewrite local nicknames before it writes values.

`namespace` is the name tree. A name has an `id`. Nested names are `nodes`. A node that has children is a group. A flow may name the group instead of each leaf. The leaf is the parameter. The object may be an ancestor of that leaf. `objects` lists the state this server holds. An entry is a path of ids from the root, joined by `/`. The same path on several servers is one fault-tolerant set. Title, kind, and place are not object fields. This document does not yet list the state fields themselves.

```yaml
templates:
  unit:
    - id: electrical
      nodes:
        - id: voltage
        - id: step
mappings:
  drive:
    voltage: holding:40001
    step: coil:1
namespace:
  - id: mill
    nodes:
      - id: hall
        nodes:
          - id: unit-1
            template: unit
          - id: unit-2
            template: unit
servers:
  - id: cell-b
    fan_in:
      - from: modbus://192.0.2.11:502
        mapping: drive
        name: mill/hall/unit-2/electrical
    fan_out:
      - to: cell-a
        name: mill/hall/unit-2/electrical
    api:
      - id: plant
        url: http://192.0.2.11:30300/api/v1
    objects:
      - mill/hall/unit-2
    profile:
      id: cell
      variables:
        cluster: cell-b
  - id: cell-a
    fan_in:
      - from: modbus://192.0.2.10:502
        mapping: drive
        name: mill/hall/unit-1/electrical
      - from: cell-b
        api: plant
        name: mill/hall/unit-2/electrical
    fan_out:
      - to: archive
        name: mill/hall/unit-1/electrical
      - to: archive
        name: mill/hall/unit-2/electrical
    api:
      - id: plant
        url: http://192.0.2.10:30300/api/v1
    objects:
      - mill/hall/unit-1
    profile:
      id: cell
      variables:
        cluster: cell-a
    service: { nodePort: 30300 }
  - id: archive
    fan_in:
      - from: cell-a
        api: plant
        name: mill/hall/unit-1/electrical
      - from: cell-a
        api: plant
        name: mill/hall/unit-2/electrical
    profile:
      id: archive
      variables:
        cluster: archive
profiles:                        # shared by many servers
  cell:
    variables:
      cluster: null
    command: ["node", "bin/edge-site.js"]
    modules:
      state_store: { enabled: true }
      message_bus: { enabled: true }
      telemetry_store: { enabled: false }
  archive:
    variables:
      cluster: null
    command: ["node", "bin/central-site.js"]
    modules:
      state_store: { enabled: true }
      message_bus: { enabled: true }
      telemetry_store: { enabled: true }
    apps:
      scada:
        image: example.invalid/plant:1
        secret: scada-postgres
      frontend:
        image: example.invalid/frontend:1
        url: https://mill.example
  cell-external:
    extends: cell
    apps:
      frontend:
        image: example.invalid/frontend:1
        nodePort: 30080
```

`mill/hall/unit-1` is three levels. Two names share a parent when their paths share a prefix. An empty segment is an error. A path that is not in `namespace` is an error.

`objects` holds the namespace nodes whose state this server keeps. The chart copies a record through when a flow names its id. A collector is such a record. A flow's `from` may name that collector.

`fan_in`, `fan_out`, and `api` name servers, sources, and one object id. They do not name databases. An unknown server id is an error. An object in `fan_out` or in a server-to-server `fan_in` must already be telemetry or ownership on that source server, or arrive there by another fan-in. Following `fan_out` for one object must not return to a server already visited. Several servers may list the same object in `ownership`; those servers are one fault-tolerant set for that editable state. One side of an edge is enough: `cell-b.fan_out` to `cell-a` and `cell-a.fan_in` from `cell-b` are the same edge. When both sides are present, the object sets must match. `fan_in`, `fan_out`, and `objects` accept `*` and `{a,b}` in a name, a server id, or an object path. `*` matches any remainder of the path, including `/`. A `fan_out` name keeps streams this server already has and does not add names from the rest of the namespace. `{a,b}` lists alternatives for one segment, and brace groups in one path expand together. A fixed `from` applies to every expanded name. A pattern selects paths and servers that already exist. It does not pair every matching server with every matching name. `from: cell-*` with `name: mill/hall/*/electrical` takes, from each matching server, the outgoing names that match the name. An object pattern expands to the namespace paths it fits. `fan_in.api` selects a service of the source when that source publishes one. It is required when the source provides more than one service. A source that publishes no api is not called. Its telemetry still arrives by `fan_out`.

Profile:

| Field | Where | What it decides |
|---|---|---|
| `profile.id` | server | profile name. Unknown name is an error |
| `variables` | profile | values a server may override. `cluster` selects the release. One Helm release, one cluster |
| `profile.variables` | server | overrides of that profile |
| `service` | server | how an API is published, for example `nodePort` |
| `command` | profile | argv of the site process |
| `modules.*` | profile | `enabled: false` installs nothing. Unknown module name is an error |
| `state_store` | module | durable records: timeline, alerts, segments. Enabled installs Postgres |
| `message_bus` | module | alerts, segments, telemetry, operations, and decisions. Enabled installs RabbitMQ. The same broker serves MQTT |
| `telemetry_store` | module | time-series measurements. Enabled installs ClickHouse |
| `extends` | profile | parent profile. The child keeps the parent's modules, command, variables, and apps. A child app id adds or replaces that one app. A child command replaces the command |
| `apps` | profile | processes this profile runs besides the modules |
| `apps.*.image` | app | image of that process |
| `apps.*.secret` | app | Secret name. The password is not a field of this document |
| `apps.*.url` | app | published address, when the app has one name for the whole profile |
| `apps.*.nodePort` | app | port on every server of this profile. The host is that server |

The document does not choose how many processes run or how they are replicated. The driver does. `apps` are the applications the user adds. Tag catalogs, cycle phases, and reports are not fields of this document.

`releases(document, cluster)` joins the selected server with its profile and returns that scada release plus the other apps of that profile. A `cluster` that matches no `profile.variables.cluster` is an error. Passwords are not fields of this document.

Scada projection:

| System document | Release values |
|---|---|
| `profile.apps.scada.image` | `image` |
| `profile.command` | `command` |
| `profile.modules.state_store` | `postgres` |
| `profile.modules.message_bus` | `rabbitmq` |
| `profile.modules.telemetry_store` | `clickhouse` |
| `profile.env` | `env` |
| `fan_in` whose `from` is not a server, joined with that server's `objects` | `machines` |
| `fan_in` whose `from` is a server, plus `fan_out` edges aimed at this server | `sites` entries `{ baseUrl, machines }`. `baseUrl` is the selected source API. A source with no api is skipped |
| `profile.apps.scada.secret` | `postgres.secret` |
| `profile.apps.scada.pullSecret` | `pullSecret` |
| `service` | `service` |

`fan_out` is not repeated on the sender's release. The receiver's `sites` list is the edge. `sites.baseUrl` is the source `plant` API. A `bus` API is the address a `fan_out` opens on another cluster. An app other than `scada` is emitted as `{ name, image, url, nodePort, schedule }` and is not rendered by this chart.

```bash
helm upgrade --install cell-a charts/scada \
  --namespace scada \
  --create-namespace \
  -f cell-a.yaml
```

`image` is required on the release. The release name becomes the DNS prefix: `cell-a-site-server`, `cell-a-supervisor-sink`, `cell-a-postgres`, `cell-a-rabbitmq`, `cell-a-clickhouse`, and `cell-a-collector-<command>` when collectors are set. The file passed to Helm is the release values below, not the system document.

## Values

These names are the chart binding. A profile does not use them. `releases` writes the projection above, including `buses` with the fan-out document paths. The plant fills `collectors` with `withCollectors(values, command)`. `paths(document)` lists namespace paths. The chart also reads `collectors`, `bus`, and `buses` from the values file.

The chart always installs supervisor-sink from `image`. Its command is fixed. `command` is the site-server argv. A collector uses `collectors[].command`.

| Field | Default | Becomes |
|---|---|---|
| `image` | empty, required | image of site-server, supervisor-sink, and each collector |
| `command` | image entrypoint | site-server argv, for example `["node", "bin/edge-site.js"]`. Omitted when empty |
| `pullSecret` | none | `imagePullSecrets` name on site-server, supervisor-sink, and collectors |
| `role` | `edge` | `SINK_DB_PROFILE` on site-server and supervisor-sink. The system document does not set it |
| `machines` | `[]` | `EDGE_MACHINES` JSON on site-server, omitted when empty |
| `sites` | `[]` | `EDGE_SITES` JSON on site-server, omitted when empty |
| `collectors` | `[]` | one collector Deployment per command. Empty installs none |
| `collectors[].address` | required | device address. The Deployment env `ADDRESS` is a JSON array of every address that command reads |
| `collectors[].path` | required | document path. The Deployment env `STREAM` is a JSON array of those paths. Each path is a telemetry ingest routing key |
| `collectors[].command` | required | collector argv. Entries that share this argv share one Deployment |
| `collectors[].mapping` | `{}` | point map. The Deployment env `MAPPING` is a JSON array of those maps, aligned with `STREAM` and `ADDRESS` |
| `bus` | `[]` | list of bus entries, concatenated with `buses`. Omitted from the default file |
| `buses` | `[]` | same list as `bus`. Omitted from the default file |
| `bus[].names` | `[]` | document paths. Each name is a telemetry ingest key and an outbox key. `buses[].names` is the same field |
| `env` | `[]` | extra `{ name, value }` pairs on the site-server container |
| `service.port` | `3000` | plant API, `PORT`, and the site-server Service port |
| `service.internalPort` | `8081` | `STATE_HTTP_PORT` on site-server and supervisor-sink |
| `service.nodePort` | `0` | when greater than zero, a NodePort Service `*-site-server-plant-lan` |
| `postgres.enabled` | `true` | in-cluster Postgres. When false, bring your own URL via `env` |
| `postgres.secret` | `scada-postgres` | Secret name |
| `postgres.database` | `scada` | `POSTGRES_DB` |
| `postgres.image` | `postgres:16` | Postgres image |
| `rabbitmq.enabled` | `true` | in-cluster RabbitMQ, STOMP and AMQP env, collector `MQTT_URL`, and the topology below |
| `rabbitmq.image` | `rabbitmq:3.13-management` | broker image |
| `clickhouse.enabled` | `false` | in-cluster ClickHouse, `CLICKHOUSE_HOST`, and `CLICKHOUSE_URL` |
| `clickhouse.image` | `clickhouse/clickhouse-server:24.8` | ClickHouse image |
| `resources` | small requests and limits | container resources on site-server, supervisor-sink, and collectors |

A collector entry needs `address`, `path`, and `command`. `mapping` may be omitted.

The chart groups entries by `command`. One command is one Deployment. Two commands that name the same `/dev/` address fail the render. Every `/dev/` address in the group is mounted from the host and the container is privileged. The Deployment name is `<release>-collector-<slug>`. The slug is the last argv word in lowercase, with runs outside `[A-Za-z0-9]` replaced by `-`.

`ADDRESS`, `STREAM`, and `MAPPING` are JSON arrays in entry order. When `rabbitmq.enabled` is true each collector also gets `MQTT_URL` `mqtt://<release>-rabbitmq:1883`. A collector `path` is an ingest key only. It does not open the outbox.

`bus` and `buses` are concatenated. The chart reads `names` on each entry. A name is an ingest key and a binding on `scada.telemetry.outbox`. The chart does not read `url` or `cluster`.

```yaml
collectors:
  - command: ["node", "bin/modbus-to-mqtt.js"]
    address: "modbus:///dev/ttyUSB0?unit=1"
    path: mill/hall/unit-1/electrical
    mapping:
      voltage: holding:40001
buses:
  - names:
      - mill/hall/unit-1/*
```

`machines` entries are opaque objects. The chart does not interpret them. A plant process that reads `EDGE_MACHINES` typically wants:

```yaml
machines:
  - id: unit-1
    device: device-1
    kind: unit
    place: tubes.hall.bay-1
```

`sites` entries are owner routes. `machineOwners` treats each machine id as owned by that `baseUrl`. A machine that appears in no site stays local. `siteSyncSites` accepts the same objects (`baseUrl` or `url`, optional `token`, optional `machines`).

```yaml
sites:
  - baseUrl: http://edge-a.plant.svc:3000/api/v1
    machines: [unit-1]
    token: plant-service
```

Do not put passwords in the values file. Postgres reads Secret `postgres.secret`:

| Key | Env |
|---|---|
| `user` | `POSTGRES_USER` on the database pod |
| `password` | `POSTGRES_PASSWORD` on the database pod |
| `url` | `POSTGRES_URL` on site-server and supervisor-sink |
| `adminUrl` | `POSTGRES_ADMIN_URL` on site-server and supervisor-sink, used to run migrations |

The chart's own RabbitMQ definitions create user `guest` / `guest` and point `STOMP_URL` and `AMQP_URL` at that broker. When the broker is enabled, collectors get `MQTT_URL` on the same Service. Replace the broker (`rabbitmq.enabled: false` plus your own `env`) when that default is not acceptable.

## What a profile installs

The profile is implementation. It decides which modules exist. Local fan-in is the telemetry the release publishes as `machines`. Fan-in from another server becomes `sites`. Ownership is editable state and is not copied into `machines`.

Empty `machines` omits `EDGE_MACHINES`. Empty `sites` omits `EDGE_SITES`. A process that falls back to a baked-in plant profile then sees the whole plant. Set ownership and fan-in when the release must not use that fallback.

## Broker topology

When `rabbitmq.enabled` is true the chart loads definitions for topic exchanges `scada.alerts`, `scada.segments`, `scada.telemetry`, `scada.operations`, `scada.user_decisions`, and durable queues `scada.segments.ingest`, `scada.telemetry.ingest`, `scada.operations.ingest`, `scada.user_decisions`. Segments, operations, and decisions are bound with routing key `#`. Telemetry ingest keys are the collector paths and the `bus` and `buses` names. With none of those, the ingest binding is `#`. A `bus` or `buses` name also creates `scada.telemetry.outbox` and binds that name there. Plugins: STOMP, MQTT, and management. AMQP is `:5672`, MQTT is `:1883`, STOMP is `:61613`. MQTT allows anonymous clients on vhost `/` and uses exchange `scada.telemetry`.

A routing key replaces `/` with `.`. The path `*` is `#`. A path that ends in `/*` is that prefix plus `.#`.

## Release values

The blocks below are what `releases` emits for one cluster. They are not the system document. `cell-b` owns `unit-2` and has no fan-in:

```yaml
image: example.invalid/plant:1
command: ["node", "bin/edge-site.js"]
clickhouse:
  enabled: false
machines:
  - { id: unit-2, device: device-2, kind: unit, place: tubes.hall.bay-1 }
```

`cell-a` owns `unit-1` and its fan-in is `unit-2`:

```yaml
image: example.invalid/plant:1
command: ["node", "bin/edge-site.js"]
clickhouse:
  enabled: false
service:
  nodePort: 30300
machines:
  - { id: unit-1, device: device-1, kind: unit, place: tubes.hall.bay-1 }
sites:
  - baseUrl: http://192.0.2.11:30300/api/v1
    machines: [unit-2]
```

`archive` has no ownership. Its fan-in is both machines from `cell-a`. Metrics go to ClickHouse:

```yaml
image: example.invalid/plant:1
command: ["node", "bin/central-site.js"]
clickhouse:
  enabled: true
sites:
  - baseUrl: http://192.0.2.10:30300/api/v1
    machines: [unit-1, unit-2]
```

External state store and an external bus, profile `cell-external`:

```yaml
image: example.invalid/plant:1
postgres:
  enabled: false
rabbitmq:
  enabled: false
env:
  - { name: POSTGRES_URL, value: postgresql://scada@db.plant.svc:5432/scada }
  - { name: POSTGRES_ADMIN_URL, value: postgresql://scada@db.plant.svc:5432/scada }
  - { name: STOMP_URL, value: stomp://mq.plant.svc:61613 }
  - { name: AMQP_URL, value: amqp://mq.plant.svc:5672 }
```

Prefer Secret references over literal URLs when the values file is stored in git. `env` values are plain strings.

## Outside this DSL

This chart does not create the Kubernetes cluster, choose how many nodes it has, or install ingress, storage class, or a remote shovel. Another app is a key under `apps` with its own `chart` and `values`. `releases` hands those values through. This chart does not render them.

The running site process still selects one migration set with `SINK_DB_PROFILE`. This document can describe a server that both sends and receives, and `releases` emits both `machines` and `sites` for it. The process does not yet apply two migration sets on that server. Several servers may own one object. The process does not yet choose which member of that set serves a request.
