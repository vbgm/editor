<!--
Temporary development panel: real typing latency and benchmark results
(milliseconds; median / p95 / max).
-->
<template>

  <div class='metrics'>
    <div class='row'>
      <span class='label'>Typing (real keys, last {{ keystrokes.length }})</span>
      <template v-if='keystroke'>
        median {{ format(keystroke.median) }} · p95 {{ format(keystroke.p95) }} · max {{ format(keystroke.max) }}
      </template>
      <template v-else>
        type in the editor to measure
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

  export default {
    name: 'Metrics',
    props: {
      keystrokes: Array,
      results: Array
    },
    data () {
      return {
        columns: ['typing.update', 'typing.frame', 'move.update', 'move.frame']
      }
    },
    computed: {
      keystroke () {
        if (!this.keystrokes.length) return null
        const sorted = [...this.keystrokes].sort((a, b) => a - b)
        const at = share => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]
        return { median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] }
      }
    },
    methods: {
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

    > .row > .label {
      color: var(--color--text--primary);
      margin-right: 0.5rem;
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
