# feathers-vuex
feathers-vuex
```
// feathers-client.ts
import feathers from '@feathersjs/feathers';
import FeathersVuex, { Model } from './plugin';
const app = feathers();
const feathersVuex = new FeathersVuex(app, {
	serverAlias: 'api',
	idField: '_id',
	whitelist: ['$regex', '$options']
});

export { app as feathersClient, feathersVuex, Model };


//store.ts
import { CancelablePromise } from 'cancelable-promise';
import { store } from 'quasar/wrappers';
import { InjectionKey } from 'vue';
import {
  createStore,
  DispatchOptions,
  Module,
  Payload,
  Store as VuexStore,
  useStore as vuexUseStore
} from 'vuex';

import feathersClient, { feathersVuex, Model } from './feathers-client';

class Comment extends Model {
  static modelName = 'Comment';
  constructor(data: Record<any, any>, options: any) {
    super(data, options);
  }
}

const servicePlugin = feathersVuex.createServicePlugin({
  model: Comment,
  service: feathersClient.service('comments'),
  servicePath: 'comments'
});

declare module 'vuex' {
  export interface Dispatch {
    <TResult = any>(type: string, payload?: any, options?: DispatchOptions): CancelablePromise<TResult>;
    <P extends Payload>(payloadWithType: P, options?: DispatchOptions): CancelablePromise<any>;
    <P extends Payload, R>(payloadWithType: P, options?: DispatchOptions): CancelablePromise<R>;
  }
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: VuexStore<StateInterface>
  }
}

// provide typings for `useStore` helper
export const storeKey: InjectionKey<VuexStore<StateInterface>> = Symbol('vuex-key')

export default store(function (/* { ssrContext } */) {
  const Store = createStore<StateInterface>({
    modules: {
    },

    plugins: [servicePlugin],

    // enable strict mode (adds overhead!)
    // for dev mode and --debug builds only
    strict: !!process.env.DEBUGGING
  })

  return Store;
})

export function useStore() {
  return vuexUseStore(storeKey)
}
```
