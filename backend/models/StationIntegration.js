const mongoose = require('mongoose');
const { Schema } = mongoose;

const stationIntegrationSchema = new Schema({
  company:      { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name:         { type: String, required: true, trim: true },
  provider:     { type: String, enum: ['generic_rest', 'sage', 'forecourt', 'pump_monitor', 'custom'], default: 'generic_rest' },
  baseUrl:      { type: String, default: '', trim: true },
  apiKey:       { type: String, select: false },
  locationId:   { type: String, default: '' },
  authMethod:   { type: String, enum: ['api_key_header', 'api_key_query', 'bearer_token', 'basic_auth', 'none'], default: 'api_key_header' },
  apiKeyHeaderName: { type: String, default: 'X-API-Key' },
  pumpEndpoint:    { type: String, default: '/pumps' },
  meterEndpoint:   { type: String, default: '/pumps/{pumpId}/meter' },
  extraHeaders: { type: Map, of: String },
  status:       { type: String, enum: ['active', 'inactive', 'error'], default: 'inactive' },
  lastTestedAt: { type: Date },
  lastError:    { type: String },
  notes:        { type: String },
}, { timestamps: true });

module.exports = mongoose.model('StationIntegration', stationIntegrationSchema);
