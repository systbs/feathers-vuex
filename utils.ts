import { Service } from '@feathersjs/feathers';
import { trim } from 'lodash';

export function getServicePath(service: Service<any>, model: any) {
	if (!service.name && !service.path && !model.servicePath) {
		throw new Error(
			`Service for model named ${String(model.name)} is missing a path or name property.`
		);
	}
	return service.path || service.name || model.servicePath;
}

export function stripSlashes(location: string) {
	return trim(location, '/')
}

export function getShortName(service: any) {
	let namespace = stripSlashes(service);
	if (Array.isArray(namespace)) {
		namespace = namespace.slice(-1);
	} else if (namespace.includes('/')) {
		namespace = namespace.slice(namespace.lastIndexOf('/') + 1);
	}
	return namespace;
}

export function getNameFromPath(service: any) {
	return stripSlashes(service);
}

export function ns(namespace: any, servicePath: any) {
	if (namespace) {
		return namespace;
	}
	return getNameFromPath(servicePath);
}

export function assignIfNotPresent(model: any, props: any): void {
	for (const key in props) {
		if (!(key in model)) {
			model[key] = props[key];
		}
	}
}
