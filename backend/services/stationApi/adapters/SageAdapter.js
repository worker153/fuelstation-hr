const GenericRestAdapter = require('./GenericRestAdapter');

// Sage adapter — same REST pattern, override if Sage API differs
class SageAdapter extends GenericRestAdapter {
  // Sage meter endpoint may return { data: { meter: 12345 } } — override if needed
  async getMeterReading(pumpId) {
    const reading = await super.getMeterReading(pumpId);
    return reading;
  }
}

module.exports = SageAdapter;
