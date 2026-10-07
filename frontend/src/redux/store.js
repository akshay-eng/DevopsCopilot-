import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import onboardingReducer from './slices/onboardingSlice';
import clusterReducer from './slices/clusterSlice';
import logsReducer from './slices/logsSlice';
import metricsReducer from './slices/metricsSlice';
import alertsReducer from './slices/alertsSlice';
import resourcesReducer from './slices/resourcesSlice';
import eventsReducer from './slices/eventsSlice';
import integrationsReducer from './slices/integrationsSlice';
import networkReducer from './slices/networkSlice';
import changesReducer from './slices/changesSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    onboarding: onboardingReducer,
    cluster: clusterReducer,
    logs: logsReducer,
    metrics: metricsReducer,
    alerts: alertsReducer,
    resources: resourcesReducer,
    events: eventsReducer,
    integrations: integrationsReducer,
    network: networkReducer,
    changes: changesReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    })
});

export default store;
