const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/.test(window.location.hostname);

const promptAndActivateUpdate = (registration: ServiceWorkerRegistration): void => {
  const waitingWorker = registration.waiting;
  if (!waitingWorker) {
    return;
  }

  const shouldUpdate = window.confirm('A new version of Daynote is available. Reload now?');
  if (!shouldUpdate) {
    return;
  }

  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
};

const attachUpdateListener = (registration: ServiceWorkerRegistration): void => {
  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) {
      return;
    }

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        promptAndActivateUpdate(registration);
      }
    });
  });
};

export const registerServiceWorker = (): void => {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(registration => {
        attachUpdateListener(registration);

        if (registration.waiting) {
          promptAndActivateUpdate(registration);
        }

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });

        if (isLocalhost) {
          console.info('Service worker registered in localhost mode.', registration);
        }
      })
      .catch(error => {
        console.error('Service worker registration failed:', error);
      });
  });
};
