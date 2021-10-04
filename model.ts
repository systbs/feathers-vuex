import { Id, Params } from '@feathersjs/feathers';
import { cloneDeep, keys, omit, pick } from 'lodash';
import { Store } from 'vuex';
import { StateInterface } from './types';

export class Model {
	[key: string]: any;

	public static servicePath: string;
	public static namespace: string;
	public static serverAlias: string;
	public static idField: string;
	public static modelName = 'Model';
	public static readonly store: Store<StateInterface>;
	public static readonly models: Record<any, any>;
	public static paramsForServer: string[] = [];
	public static instance: Record<any, any> = {};
	public static blacklist: string[] = [];
	public static params: Params;

	constructor(data: Record<any, any>, options?: any) {
		for (const key in data) {
			this[key] = Reflect.get(data, key);
		}
	}

	public static find(params?: Params) {
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/find`, params);
	}

	public static get(id: Id, params?: Params) {
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/get`, { id, params });
	}

	public static count(params?: Params) {
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/count`, params);
	}

	commit(params?: Params) {
		const { namespace, store, idField, blacklist } = this.constructor as typeof Model;
		const data = omit(this, blacklist);
		store.commit(`${namespace}/update`, data);
		return store.getters[`${namespace}/get`]({ id: this[idField], params });
	}

	create(params?: Params) {
		const { namespace, store, instance, blacklist } = this.constructor as typeof Model;
		const data = instance ?
			pick(omit(this, blacklist), keys(instance)) : omit(this, blacklist);
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
		const { namespace, store, idField, blacklist, instance } = this.constructor as typeof Model;
		const id = this[idField];
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		const data = instance ?
			pick(omit(this, blacklist), keys(instance)) : omit(this, blacklist);
		return store.dispatch(`${namespace}/patch`, { id, data, params });
	}

	update(params?: Params) {
		const { namespace, store, idField, blacklist, instance } = this.constructor as typeof Model;
		const id = this[idField];
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		const data = instance ?
			pick(omit(this, blacklist), keys(instance)) : omit(this, blacklist);
		return store.dispatch(`${namespace}/update`, { id, data, params });
	}

	clone() {
		const { idField } = this.constructor as typeof Model;
		const id = this[idField];
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		return cloneDeep(this);
	}

	toJSON() {
		const { blacklist } = this.constructor as typeof Model;
		return omit(this, blacklist);
	}
}
