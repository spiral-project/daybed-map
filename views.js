var DefinitionCreate = Daybed.FormView.extend({
    model: MapModel,

    setup: function () {
        var instance = new this.model({
            id: this.modelname,
            title: this.modelname,
            description: this.modelname,
            fields: [
                {name: "label", label: "Label", required: true, type: "string"},
                {name: "location", label: "Location", required: true, type: "point"},
            ]
        });
        this.options.title = 'Create map ' + this.modelname;
        Daybed.FormView.prototype.setup.call(this, instance);
    },

    cancel: function () {
        Daybed.FormView.prototype.cancel.apply(this, arguments);
        app.navigate('', {trigger: true});
        return false;
    },

    /**
     * Redirect to list view.
     */
    success: function () {
        Daybed.FormView.prototype.success.apply(this, arguments);
        app.navigate(this.modelname, {trigger: true});
        return false;
    }
});


var MapRecordView = Daybed.RecordFormView.extend({
    model: MapRecord,

    initialize: function () {

        Daybed.RecordFormView.prototype.initialize.call(this);

        this.map = null;
        this.layer = null;

        if (this.options.map) {
            this.setMap(this.options.map);
        }
    },

    setMap: function (map) {
        this.map = map;

        var geomField = this.definition.geomField();
        if (!geomField) return;

        // Assign dedicated layer editor from geometry field type
        var handlers = {
            'point': new L.Draw.Marker(this.map),
            'line': new L.Draw.Polyline(this.map),
            'polygon': new L.Draw.Polygon(this.map)
        };
        this.handler = handlers[geomField.type];
        this.map.on('draw:created', this.onDraw, this);
    },

    render: function () {
        Daybed.RecordFormView.prototype.render.apply(this, arguments);

        if (this.creation) {
            if (this.handler) {
                this.handler.enable();
                this.$el.append('<span class="map-help alert">Click on map</span>');
            }
        }
        else {
            var layer = this.instance ? this.instance.getLayer() : null;
            if (layer) {
                this._backup = layer;
                this.map.removeLayer(this._backup);
                // Bind instance to editable layer
                this.instance.layer = null;
                layer = this.instance.getLayer();
                this.onDraw({layer: layer});

                this.$el.append('<span class="map-help alert">Drag to update</span>');
            }
        }

        return this;
    },

    close: function (e) {
        if (this.handler) {
            this.handler.disable();
        }
        if (this.creation && this.layer) {
            this.map.removeLayer(this.layer);
        }
        this.layer = null;
        this.trigger('close');
        this.remove();
        return false;
    },

    cancel: function () {
        Daybed.RecordFormView.prototype.cancel.apply(this, arguments);
        this.close();
        if (this._backup) {
            this.instance.layer = this._backup;
            this.map.addLayer(this._backup);
        }
        return false;
    },

    success: function () {
        Daybed.RecordFormView.prototype.success.apply(this, arguments);
        this.close();
        return false;
    },

    onDraw: function (e) {
        this.layer = e.layer;
        this.refreshNewLayer();
        this.layer.addTo(this.map);

        this.$el.find('.map-help').text("Drag to update");

        // Make it editable and save while editing
        this.layer[this.layer instanceof L.Marker ? 'dragging' : 'editing'].enable();
        this.layer.on('dragend edit', function storefield (e) {
            this.instance.setLayer(this.layer);
        }, this);
        this.layer.fire('edit');  // store once

        // Refresh newly created layer on form change
        this.form.on('change', this.refreshNewLayer, this);
    },

    refreshNewLayer: function () {
        if (!this.layer)
            return;
        var style = L.Util.extend({}, Daybed.SETTINGS.STYLES['default']),
            colorField = this.definition.colorField(),
            iconField = this.definition.iconField();
        var data = this.form.getValue(),
            color = colorField ? data[colorField.name] : style.color;
        // Refresh layer color
        if (typeof this.layer.setStyle == 'function') {
            style.color = color;
            style.fillColor = color;
            this.layer.setStyle(style);
        }
        // Refresh Marker color and icon
        if (iconField && typeof this.layer.setIcon == 'function') {
            var marker = {icon: data[iconField.name], markerColor: color, prefix: 'fa'};
            this.layer.setIcon(L.AwesomeMarkers.icon(marker));
        }
    }
});


var MapListView = Daybed.TableView.extend({
    initialize: function () {
        Daybed.TableView.prototype.initialize.apply(this, arguments);

        this.map = null;
        this.grouplayer = L.featureGroup();

        // Fit map to layer bounds when both collection and map are ready
        this.collection.bind('sync', function () {
            // Zoom-in effet
            setTimeout((function () {
                if (this.collection.length <= 0)
                    return;
                if (this.map)
                    this.map.fitBounds(this.grouplayer.getBounds());
            }).bind(this), 750);
        }, this);
    },

    render: function () {
        Daybed.TableView.prototype.render.apply(this, arguments);

        this.map = L.map(this.options.map).setView([0, 0], 3);
        this.map.attributionControl.setPrefix('');
        L.tileLayer(Daybed.SETTINGS.TILES).addTo(this.map);
        this.grouplayer.addTo(this.map);

        return this;
    },

    addOne: function (record) {
        var row = Daybed.TableView.prototype.addOne.apply(this, arguments);

        var layer = record.getLayer();
        if (!layer)
            return;

        layer.bindPopup(this.templatePopup(record.definition)(record.toJSON()));
        this.grouplayer.addLayer(layer);

        // Row and map records highlighting
        layer.on('mouseover', function (e) {
            if (this.setStyle) this.setStyle(Daybed.SETTINGS.STYLES.highlight);
            // Pop on top
            if (typeof this.bringToFront == 'function')
                this.bringToFront();
            $(row).addClass('success')
               .css("opacity", "0.1")
               .animate({opacity: 1.0}, 400);
        }, layer);

        layer.on('mouseout',  function (e) {
            if (this.setStyle) this.setStyle(style);
            $(row).removeClass('success');
        }, layer);

        layer.on('click', function (e) {
            var offset = $(row).offset();
            if (offset)
                window.scrollTo(0, offset.top);
        });

        var $row = $(row);
        $row.hoverIntent(function () {
            if (typeof layer.bounce == 'function') {
                if (layer._map)
                    layer.bounce(300, 50);
            }
            layer.fire('mouseover');
        },
        function () {
            layer.fire('mouseout');
        });

        var map = this.map;
        $row.on('dblclick', function () {
            if (typeof layer.getLatLng == 'function')
                map.panTo(layer.getLatLng());
            else
                map.fitBounds(layer.getBounds());
            layer.openPopup();
        });
    },

    delete: function (record, row) {
        Daybed.TableView.prototype.delete.apply(this, arguments);
        this.map.removeLayer(record.layer);
    },

    templatePopup: function (definition) {
        var c = '<div>';
        _.each(definition.fields(), function (f, i) {
            c += '<li title="' + f.description + '"><strong>' + f.name + '</strong>: {{ ' + f.name + ' }}</li>';
        });
        c += '</div>';
        return Mustache.compile(c);
    },
});


var MainView = Backbone.View.extend({
    template: Mustache.compile('<div id="map"></div>' +
                               '<h1>{{ definition.title }}</h1>' +
                               '<p>{{ definition.description }}</p><div id="toolbar"><a id="add" class="btn">Add</a></div>' +
                               '<div id="list"></div>'),

    events: {
        "click a#add": "_buildForm",
        "click a.close": "deleteRecord"
    },

    initialize: function (definition) {
        this.definition = definition;

        this.collection = new MapRecordList(definition);

        this.formView = new MapRecordView({definition: definition,
                                           collection: this.collection});

        this.formView.bind('created', function (instance) {
            this.collection.add(instance);
        }, this);

        this.listView = new MapListView({map: "map",
                                         collection: this.collection});

        this.listView.on('edit', function (record, row) {
            this._buildForm(undefined, record, row);
        }, this);

        // Fetch records!
        this.collection.fetch();
    },

    _buildForm: function (e, record, row) {
        if (row) {
            row.$el.addClass('info');
            this.formView.instance = record;
        }
        this.formView.bind('close', function () {
            $('tr.info').removeClass('info');
            this.$("a#add").show();
        }, this);
        this.formView.setup();
        this.$("a#add").hide()
                       .after(this.formView.render().el);
    },

    render: function () {
        this.$el.html(this.template({definition: this.definition.attributes}));

        // Leaflet cannot render on detached DOM node
        $(document).on('DOMNodeInserted', function(e) {
            if (e.target.id == this.$el.attr('id')) {

                this.$("#list").html(this.listView.render().el);

                // If definition contains geometry field, shows the map.
                if (this.definition.geomField() !== null) {
                    this.formView.setMap(this.listView.map);
                }
                else {
                    this.$("#map").hide();
                    $('#list').width('100%');
                }
            }
        }.bind(this));

        return this;
    },
});


var HomeView = Backbone.View.extend({
    template: Mustache.compile('<div class="hero-unit"><h1>Daybed Map</h1>' +
                               '<p>Join an existing map or create a new one.</p>' +
                               '<input id="modelname" placeholder="Name"/> <a id="go" href="#" class="btn">Go</a></div>'),

    events: {
        "keyup input#modelname": "setLink"
    },

    render: function () {
        this.$el.html(this.template({}));
        setTimeout(function () {
            $('#modelname').focus();
        }, 0);
        return this;
    },

    setLink: function (e) {
        if (e.which == 13) { // Enter
            app.navigate($(e.target).val(), {trigger:true});
        }
        this.$("#go").attr("href", '#' + $(e.target).val());
    }
});
