<!--
Temporary development panel: real typing latency and benchmark results
(milliseconds; median / p95 / max).
Latency is collected outside Vue and copied in twice a second, so typing never re-renders Vue.
-->
<template>

  <div class='metrics'>
    <div class='row'>
      <span class='label'>Typing (key press → paint)</span>
      <template v-if='!latency.isSupported'>
        not measurable in this browser (no Event Timing API)
      </template>
      <template v-else-if='!latency.keys'>
        type or move the cursor in the editor to measure
      </template>
      <template v-else>
        {{ latency.keys }} keys · {{ latency.slow16 }} at 16 ms or more · {{ latency.slow32 }} at 32 ms or more · worst {{ latency.worst }} ms
        <button
          class='reset'
          @click='reset'
        >
          reset
        </button>
      </template>
    </div>

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

  const inputLatency = createInputLatency()

  export default {
    name: 'Metrics',
    props: {
      results: Array
    },
    data () {
      return {
        columns: ['typing.update', 'typing.frame', 'move.update', 'move.frame'],
        latency: {}
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
        const { isSupported, keys, slow } = inputLatency
        if (keys == this.latency.keys && slow.length == this.latency.slowCount) return
        this.latency = {
          isSupported,
          keys,
          slowCount: slow.length,
          slow16: slow.length,
          slow32: slow.filter(duration => duration >= 32).length,
          worst: slow.length ? Math.max(...slow) : 0
        }
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
