import { Id, Params } from '@feathersjs/feathers';
import { cloneDeep, merge, omit } from 'lodash';
import { Store } from 'vuex';
import { StateInterface } from './types';

const blacklist = [
	'options'
];

export class Model {
	[key: string]: any;

	public static servicePath: string;
	public static namespace: string;
	public static serverAlias: string;
	public static idField: string;
	public static modelName = 'Model';
	public static readonly store: Store<StateInterface>;
	public static readonly models: Record<any, any>;

	constructor(data: Record<any, any>, options?: any) {
		for (const key in data) {
			this[key] = Reflect.get(data, key);
		}
	}

	public static getInstance() {
		return this;
	}

	public static find(params?: Params) {
		const { namespace, store } = this;
		if (namespace && store)
			return store.dispatch(`${namespace}/find`, params);
	}

	public static get(id: Id, params?: Params) {
		const { namespace, store } = this;
		if (namespace && store)
			return store.dispatch(`${namespace}/get`, { id, params });
	}

	public static count(params?: Params) {
		const { namespace, store } = this;
		if (namespace && store)
			return store.dispatch(`${namespace}/count`, params);
	}

	commit() {
		const { namespace, store, idField } = this.constructor as typeof Model;
		const data = omit(this, blacklist);
		store.commit(`${namespace}/update`, data);
		return store.getters(`${namespace}/get`, this[idField]);
	}

	create(params?: Params) {
		const { namespace, store } = this.constructor as typeof Model;
		const data = omit(this, blacklist);
		return store.dispatch(`${namespace}/create`, { data, params });
	}

	remove(params?: Params) {
		const { namespace, store, idField } = this.constructor as typeof Model;
		const id = this[idField];
		if (id !== null) {
			return store.dispatch(`${namespace}/remove`, { id, params });
		}
		store.commit(`${namespace}/remove`, { id, params });
		return Promise.resolve(this);
	}

	patch(params?: Params) {
		const { namespace, store, idField } = this.constructor as typeof Model;
		const id = this[idField];
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		const data = omit(this, blacklist);
		return store.dispatch(`${namespace}/patch`, { id, data, params });
	}

	update(params?: Params) {
		const { namespace, store, idField } = this.constructor as typeof Model;
		const id = this[idField];
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		const data = omit(this, blacklist);
		return store.dispatch(`${namespace}/update`, { id, data, params });
	}

	clone() {
		const { idField } = this.constructor as typeof Model;
		const id = this[idField];
		console.log({ Model: Model.getInstance(), data: this });
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		return cloneDeep(this);
	}

	toJSON() {
		return omit(this, blacklist);
	}
}
