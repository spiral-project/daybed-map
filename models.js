var MapRecord = Daybed.Record.extend({
    /**
     * Returns instance layer, if its model has a geometry field.
     * It basically builds a Leaflet layer, from the coordinates values
     * stored in daybed record.
     * @returns {L.Layer}
     */
    getLayer: function () {
        if (!this.layer) {
            var geomfield = this.definition.geomField();
            if (!geomfield) return;

            var factories = {
                'point': function (coords) {return L.circleMarker([coords[1], coords[0]]);},
                'line': function (coords) {return L.polyline(L.GeoJSON.coordsToLatLngs(coords));},
                'polygon': function (coords) {return L.polygon(L.GeoJSON.coordsToLatLngs(coords[0]));}
            };

            var coords = this.get(geomfield.name);
            if (typeof coords === 'string') {
                coords = JSON.parse(coords);
            }
            this.layer = factories[geomfield.type](coords);
        }
        return this.layer;
    },

    /**
     * Sets record geometry field from a Leaflet layer.
     * @param {L.Layer} layer
     */
    setLayer: function (layer) {
        var geomfield = this.definition.geomField();
        if (!geomfield) return;

        var coords = layer.toGeoJSON().geometry.coordinates,
            attrs = {};
        attrs[geomfield.name] = JSON.stringify(coords);
        this.set(attrs);
    }
});


var MapRecordList = Daybed.RecordList.extend({
    model: MapRecord
});


var MapModel = Daybed.Definition.extend({
    metaTypes: _.extend(Daybed.Definition.prototype.metaTypes, {
        'color': 'string',
        'icon': 'string'
    }),

    recordSchema: function () {
        var geom = function (f) {
            return {type: 'TextArea',
                    editorAttrs: {style: 'display: none'},
                    help: f.description + ' <span>(on map)</span>'};
        };
        var fieldMapping = {
            'color': function () {
                return { type: 'Select', options: [
                    'red', 'blue', 'orange', 'green', 'purple',
                    'darkred', 'darkgreen', 'darkblue', 'darkpurple', 'cadetblue'
                ] };
            },
            'icon':  function () {
                return { type: 'Select', options: [
                    {group: 'Location',
                     options: ['home', 'music', 'medkit', 'camera-retro',
                               'info-sign', 'plane', 'shopping-cart']},
                    {group: 'Food & Drink',
                     options: ['food', 'glass', 'coffee']},
                    {group: 'Symbols',
                     options: ['flag', 'star', 'suitcase', 'comments']}
                ] };
            },
            'point': geom,
            'line': geom,
            'polygon': geom
        };
        var schema = Daybed.Definition.prototype.recordSchema.call(this);
        $(this.attributes.fields).each(function (i, field) {
            var build = fieldMapping[field.meta || field.type];
            if (build) {
                schema[field.name] = build(field);
            }
        });
        return schema;
    },

    /**
     * Returns field names that are not of type geometry.
     * @returns {Array[string]}
     */
    mainFields: function () {
        var geomField = this.geomField();
        if (!geomField)
            return this.attributes.fields;
        return this.attributes.fields.filter(function (f) {
            return f.name != geomField.name;
        });
    },

    /**
     * Returns the first field whose type is Geometry.
     * @returns {string} ``null`` if no geometry field in *Definition*
     */
    geomField: function () {
        for (var i in this.attributes.fields) {
            var f = this.attributes.fields[i];
            if (f.type == 'point' || f.type == 'line' || f.type == 'polygon')
                return f;
        }
        return null;
    },

    _getFields: function (metatype) {
        return _.filter(this.attributes.fields,
                        function(f) { return f.meta == metatype; });
    },

    colorField: function () {
        return this._getFields('color')[0];
    },

    iconField: function () {
        return this._getFields('icon')[0];
    }
});
