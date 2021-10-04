# feathers-vuex
feathers-vuex
```ts
// feathers-client.ts
import feathers from '@feathersjs/feathers';
import FeathersVuex, { Model } from './index';
const app = feathers();
const feathersVuex = new FeathersVuex(app, {
	serverAlias: 'api',
	idField: '_id',
	whitelist: ['$regex', '$options']
});

export { app as feathersClient, feathersVuex, Model };


//store.ts
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
    <TResult = any>(type: string, payload?: any, options?: DispatchOptions): Promise<TResult>;
    <P extends Payload>(payloadWithType: P, options?: DispatchOptions): Promise<any>;
    <P extends Payload, R>(payloadWithType: P, options?: DispatchOptions): Promise<R>;
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


// how to use 

const {Comment} = feathersVuex.models.api;
const comment = await Comment.get('614e3dff8a5a6d0654c52f3e');
const cloned = comment.clone();
cloned.value = 'new value';
cloned.patch();

```


## useQuery
```ts
const { Post, Comment, View } = feathersVuex.models.api;

async function findCommentHook(record:any, context:any){
const response = await useQuery({
model: Comment,
method: 'find',
params: {
  query: {
    owner: record.id
  }
}
});
const clone = record.clone();
clone.comments = Reflect.get(response, 'items');
clone.commit();
}

async function findViewHook(record:any, context:any){
const response = await useQuery({
model: View,
method: 'find',
params: {
  query: {
    owner: record.id
  }
}
});
const clone = record.clone();
clone.views = Reflect.get(response, 'items');
clone.commit();
}


const result = await useQuery({
model:Post,
method: 'find',
params: computed(() => ({
  query:{
	uid:'sample-identifier'
  }
})),
hooks: [
  findCommentHook, findViewHook
]
});

console.log({result});
```
