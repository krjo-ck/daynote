import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './index.css';
import App from './App';
import ErrorPage from './ErrorPage';
import Week, { loader as weekLoader } from './Week';
import Day, { loader as dayLoader } from './Day';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: '',
        element: <Week />,
        loader: weekLoader,
      },
      {
        path: 'week',
        element: <Week />,
        loader: weekLoader,
      },
      {
        path: 'week/:week',
        element: <Week />,
        loader: weekLoader,
      },
      {
        path: 'day/:day',
        element: <Day />,
        loader: dayLoader,
      },
    ],
  },
]);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
