<!--
Temporary development panel: real typing latency per look, and benchmark results
(milliseconds; median / p95 / max).
Latency is collected outside Vue and copied in twice a second, so typing never re-renders Vue.
'A frame late' uses the browser's Event Timing numbers where available, the own measurement elsewhere.
-->
<template>

  <div class='metrics'>
    <div class='row'>
      <span class='label'>Typing, key press → paint</span>
      <template v-if='!latency.length'>
        type or move the cursor in the editor to measure; switch the look to compare
      </template>
      <button
        v-else
        class='reset'
        @click='reset'
      >
        reset
      </button>
    </div>

    <table v-if='latency.length'>
      <thead>
        <tr>
          <th>look</th>
          <th>keys</th>
          <th>median / p95 / max</th>
          <th>a frame late (≥ 32 ms)</th>
          <th v-if='isEventTimingSupported'>worst (Event Timing)</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for='row in latency'
          :key='row.look'
          :class='{current: row.look == look}'
        >
          <td>{{ row.look }}</td>
          <td>{{ row.keys }}</td>
          <td>{{ row.own ? spread(row.own) : `–` }}</td>
          <td>{{ row.late }} ({{ row.lateShare }}%)</td>
          <td v-if='isEventTimingSupported'>{{ row.worst ? `${row.worst} ms` : `–` }}</td>
        </tr>
      </tbody>
    </table>

    <table v-if='results.length'>
      <thead>
        <tr>
          <th>blocks</th>
          <th>lines</th>
          <th>count</th>
          <th>load</th>
          <th>parse + blocks</th>
          <th>typing update</th>
          <th>typing frame</th>
          <th>move update</th>
          <th>move frame</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for='result in results'
          :key='result.name'
        >
          <td>{{ result.name }}</td>
          <td>{{ result.lines }}</td>
          <td>{{ result.blockCount }}</td>
          <td>{{ format(result.load) }}</td>
          <td>{{ format(result.blocks) }}</td>
          <td
            v-for='column in columns'
            :key='column'
          >
            {{ spread(column.split(`.`).reduce((value, key) => value[key], result)) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>

</template><script>

  // functions
  import createInputLatency from './functions/input-latency.js'
  import summary from './functions/summary.js'

  const inputLatency = createInputLatency()
  const looks = ['cards', 'plain', 'textarea']

  export default {
    name: 'Metrics',
    props: {
      // the current look; key presses are counted for it
      look: String,
      results: Array
    },
    data () {
      return {
        columns: ['typing.update', 'typing.frame', 'move.update', 'move.frame'],
        isEventTimingSupported: inputLatency.isEventTimingSupported,
        latency: [],
        // to skip copying when nothing changed
        latencyVersion: ''
      }
    },
    watch: {
      'look': {
        handler (look) {
          inputLatency.look = look
        },
        immediate: true
      }
    },
    created () {
      this.copyLatency()
      this.interval = setInterval(this.copyLatency, 500)
    },
    beforeUnmount () {
      clearInterval(this.interval)
    },
    methods: {
      copyLatency () {
        const { byLook } = inputLatency
        const version = looks.map(look => `${byLook[look]?.keys}:${byLook[look]?.own.length}:${byLook[look]?.slow.length}`).join()
        if (version == this.latencyVersion) return
        this.latencyVersion = version

        this.latency = looks.filter(look => byLook[look]?.keys).map(look => {
          const { keys, own, slow } = byLook[look]
          const late = this.isEventTimingSupported
            ? slow.filter(duration => duration >= 32).length
            : own.filter(duration => duration >= 32).length
          return {
            look,
            keys,
            own: own.length ? summary(own) : null,
            late,
            lateShare: Math.round(late / keys * 100),
            worst: slow.length ? Math.max(...slow) : 0
          }
        })
      },
      reset () {
        inputLatency.reset()
        this.copyLatency()
      },
      spread ({ median, p95, max }) {
        return `${this.format(median)} / ${this.format(p95)} / ${this.format(max)}`
      },
      format (ms) {
        return ms < 10 ? ms.toFixed(1) : Math.round(ms)
      }
    }
  }

</script><style scoped lang='less'>

  .metrics {
    flex: 0 0 auto;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--color--text--secondary);
    background: var(--color--background--secondary);
    border-top: 1px solid var(--color--border--solid);

    > .row {
      > .label {
        color: var(--color--text--primary);
        margin-right: 0.5rem;
      }

      > .reset {
        font: inherit;
        color: inherit;
        background: none;
        border: none;
        text-decoration: underline;
        cursor: pointer;
      }
    }

    > table {
      margin-top: 0.4rem;

      > tbody > tr.current > td:first-child {
        color: var(--color--text--primary);
        font-weight: 600;
      }

      border-collapse: collapse;

      th, td {
        text-align: left;
        padding: 0.1rem 0.9rem 0.1rem 0;
        white-space: nowrap;
      }

      th {
        font-weight: 500;
        color: var(--color--text--primary);
      }
    }
  }

</style>
