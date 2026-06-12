class BaseAdapter {
  constructor(config) { this.config = config; }
  async getPumps()              { throw new Error('getPumps() not implemented'); }
  async getMeterReading(pumpId) { throw new Error('getMeterReading() not implemented'); }
  async testConnection()        { throw new Error('testConnection() not implemented'); }
}

module.exports = BaseAdapter;
